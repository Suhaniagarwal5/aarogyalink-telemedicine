const mongoose = require('mongoose');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const { client } = require('../config/redis');
const { generateClinicalBrief, generatePrescriptionSuggestion } = require('../services/ai/triage.service');
const queueSSEManager = require('../services/sse/queue.sse');
const { addPDFJob } = require('../services/queue/pdf.queue');
const { sendBookingConfirmation } = require('../services/mail/mail.service');
const { scheduleReminder } = require('../services/mail/reminder.service');
const { isSlotInPast } = require('../utils/helpers');
const Notification = require('../models/Notification');
const { getIO } = require('../services/socket/socket.service');

/**
 * POST /api/bookings
 * Creates a booking, invalidates cache, pushes to Redis queue,
 * triggers SSE, sends confirmation email, and schedules a reminder.
 */
const createBooking = async (req, res) => {
  try {
    const { slotId, patientId, symptomBrief } = req.body;
    if (!slotId || !mongoose.Types.ObjectId.isValid(slotId))
      return res.status(400).json({ error: 'Invalid slotId' });
    if (!patientId)
      return res.status(400).json({ error: 'Missing patientId' });

    // Atomic: mark slot as booked only if it's still available (race-condition safe)
    const slot = await Slot.findOneAndUpdate(
      { _id: slotId, isBooked: false },
      { isBooked: true, bookedBy: patientId },
      { new: true }
    );
    if (!slot) return res.status(400).json({ error: 'Slot already booked or not found' });

    // Reject bookings for slots whose time has already passed
    if (isSlotInPast(slot.date, slot.startTime)) {
      // Revert the atomic claim — slot shouldn't stay locked for a past time
      await Slot.findByIdAndUpdate(slotId, { isBooked: false, bookedBy: null });
      return res.status(400).json({ error: 'Cannot book a slot whose time has already passed.' });
    }

    // AI Triage: if patient provided raw symptoms, generate a clinical brief
    let finalBrief = symptomBrief || '';
    if (req.body.rawSymptoms && !symptomBrief) {
      finalBrief = await generateClinicalBrief(req.body.rawSymptoms);
    }

    const videoLink = `https://meet.jit.si/aarogyalink-${slotId}-${Date.now()}`
      
    const booking = await Booking.create({
      slotId, patientId, doctorId: slot.doctorId,
      symptomBrief: finalBrief,
      videoLink,
    });

    // Invalidate slot availability cache
    await client.del(`slots:all:${slot.date}`);
    await client.del(`slots:${slot.doctorId}:${slot.date}`);
    await client.del(`slots:all:any`);
    await client.del(`slots:${slot.doctorId}:any`);

    // Add to Redis sorted queue (score = timestamp for FIFO order)
    await client.zAdd(`queue:${slot.doctorId}`, {
      score: Date.now(),
      value: booking._id.toString(),
    });

    // Trigger SSE update for all clients watching this doctor's queue
    queueSSEManager.broadcastQueueUpdate(slot.doctorId);

    // Get queue position immediately
    const queue = await client.zRange(`queue:${slot.doctorId}`, 0, -1);
    const position = queue.findIndex(id => id === booking._id.toString()) + 1;

    // Write audit log
    await AuditLog.create({
      action: 'booking_created',
      performedBy: patientId,
      targetId: booking._id,
      metadata: { doctorId: slot.doctorId, slotId, position },
    });

  // Send Email Confirmation — use req.user from JWT, no extra DB query needed
  const patientName = req.user.name;
  const patientEmail = req.user.email;

  if (patientEmail) {
    sendBookingConfirmation(patientEmail, {
      patientName,
      doctorName: slot.doctorId.name || 'Your Doctor',
      date: slot.date,
      time: slot.time
    });
  }

  // Schedule 1-hour Reminder
  try {
    const slotDateTime = new Date(`${slot.date}T${slot.startTime}:00`);
    const reminderTime = new Date(slotDateTime.getTime() - 60 * 60 * 1000);
    const delay = reminderTime.getTime() - Date.now();

    if (delay > 0 && patientEmail) {
      await scheduleReminder(patientEmail, {
        patientName,
        doctorName: slot.doctorId.name || 'Your Doctor',
        date: slot.date,
        time: slot.time
      }, delay);
    }
  } catch (err) {
    console.error('Reminder scheduling failed:', err);
  }

    // ── Real-Time Notifications ──
    try {
      const [savedPatientNotif, savedDoctorNotif] = await Notification.insertMany([
        {
          user: patientId,
          message: `Your appointment has been booked for ${slot.date} at ${slot.startTime}.`,
          type: 'booking_created',
          link: '/patient',
        },
        {
          user: slot.doctorId,
          message: `New appointment booked by ${req.user.name} for ${slot.date} at ${slot.startTime}.`,
          type: 'booking_created',
          link: '/doctor',
        },
      ]);

      // Push live via WebSocket (fire-and-forget — don't block the response)
      const io = getIO();
      io.to(patientId.toString()).emit('notification', savedPatientNotif);
      io.to(slot.doctorId.toString()).emit('notification', savedDoctorNotif);
    } catch (notifErr) {
      console.error('Notification emit failed (non-fatal):', notifErr.message);
    }

    res.status(201).json({ message: 'Booking successful', booking, queuePos: position });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/bookings/queue/:doctorId
 * Returns the full Redis sorted-set queue for a doctor.
 */
const getDoctorQueue = async (req, res) => {
  try {
    const queue = await client.zRange(`queue:${req.params.doctorId}`, 0, -1);
    res.json({ queue, total: queue.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/bookings/position/:doctorId/:bookingId
 * Returns the patient's current position within a doctor's queue.
 */
const getPatientQueuePosition = async (req, res) => {
  try {
    const { doctorId, bookingId } = req.params;
    const queue = await client.zRange(`queue:${doctorId}`, 0, -1);
    const index = queue.findIndex(id => id === bookingId);
    if (index === -1) return res.status(404).json({ message: 'Not found in queue' });
    res.json({ position: index + 1, patientsAhead: index, total: queue.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/bookings/complete/:bookingId
 * Marks a booking as completed, removes from queue,
 * triggers SSE done event, and queues PDF generation.
 */
const completeBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { prescription } = req.body;

    const booking = await Booking.findById(bookingId).populate('patientId doctorId');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Update booking status
    booking.status = 'completed';
    booking.prescription = prescription;
    await booking.save();

    // Remove from Redis queue
    await client.zRem(`queue:${booking.doctorId._id}`, booking._id.toString());

    // Trigger SSE updates
    queueSSEManager.sendDone(booking.doctorId._id.toString(), bookingId);
    queueSSEManager.broadcastQueueUpdate(booking.doctorId._id);

    // Queue background PDF generation
    await addPDFJob({
      bookingId: booking._id,
      patientName: booking.proxyPatientName || booking.patientId.name,
      doctorName: booking.doctorId.name,
      symptomBrief: booking.symptomBrief,
      prescription: prescription
    });

    res.json({ message: 'Booking completed and PDF generation queued', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/bookings/:id/cancel
 * Cancels a booking, frees the slot, removes from Redis queue, and triggers SSE updates.
 */
const cancelBooking = async (req, res) => {
  try {
    const { id: bookingId } = req.params;

    const booking = await Booking.findById(bookingId).populate('doctorId');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'booked') return res.status(400).json({ error: 'Only active bookings can be cancelled' });

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    // Revert the slot to available
    const slot = await Slot.findByIdAndUpdate(booking.slotId, {
      isBooked: false,
      bookedBy: null
    });

    // Remove from Redis queue
    await client.zRem(`queue:${booking.doctorId._id}`, booking._id.toString());

    // Invalidate slot caches
    if (slot) {
      await client.del(`slots:all:${slot.date}`);
      await client.del(`slots:${slot.doctorId._id}:${slot.date}`);
      await client.del(`slots:all:any`);
      await client.del(`slots:${slot.doctorId._id}:any`);
    }

    // Trigger SSE updates
    queueSSEManager.sendDone(booking.doctorId._id.toString(), bookingId);
    queueSSEManager.broadcastQueueUpdate(booking.doctorId._id);

    // Audit log
    await AuditLog.create({
      action: 'booking_cancelled',
      performedBy: req.user ? req.user.id : booking.patientId,
      targetId: booking._id,
      metadata: { doctorId: booking.doctorId._id, slotId: booking.slotId }
    });

    res.json({ message: 'Booking cancelled successfully', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/bookings
 * Returns all bookings for the logged-in patient (via query param patientId).
 * Populates doctorId, slotId, and includes prescriptionUrl for PDF download.
 */
const getPatientBookings = async (req, res) => {
  try {
    const { patientId } = req.query;
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

    const bookings = await Booking.find({ patientId })
      .populate('doctorId', 'name specialty')
      .populate('slotId', 'date time')
      .sort({ createdAt: -1 })
      .lean();

    for (const booking of bookings) {
      if (booking.status === 'booked' && booking.doctorId) {
        const rank = await client.zRank(`queue:${booking.doctorId._id}`, booking._id.toString());
        if (rank !== null) {
          booking.queuePosition = rank + 1;
        }
      }
    }

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/bookings/ai-suggest
 * Uses Claude API to generate a prescription suggestion for the doctor
 * based on the patient's structured clinical symptom brief.
 * Teacher checklist: "Claude API (/v1/messages): prompt engineering"
 */
const getAIPrescriptionSuggestion = async (req, res) => {
  try {
    const { symptomBrief } = req.body;
    if (!symptomBrief) return res.status(400).json({ error: 'Missing symptomBrief' });

    const suggestion = await generatePrescriptionSuggestion(symptomBrief);
    res.json({ suggestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createBooking,
  getDoctorQueue,
  getPatientQueuePosition,
  completeBooking,
  getPatientBookings,
  getAIPrescriptionSuggestion,
  cancelBooking,
};
