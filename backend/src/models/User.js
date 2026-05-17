const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true 
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6 
  },
  role: { 
    type: String, 
    enum: ['patient', 'doctor', 'asha', 'admin'], 
    default: 'patient',
    required: true
  },
  phone: { 
    type: String,
    trim: true 
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected'],
    default: 'active'
  },
  certificateUrl: {
    type: String
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function() {
  // 1. Only hash if the password was modified (or is new)
  if (!this.isModified('password')) return;

  // 2. Simply await the hash. No need for try/catch here if you 
  // have a global error handler, but it doesn't hurt.
  this.password = await bcrypt.hash(this.password, 10);
  
  // 3. No next() call needed! Mongoose sees the function is done 
  // when the code reaches the end.
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);