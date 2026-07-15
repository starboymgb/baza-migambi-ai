const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, required: true, unique: true }, // Nimero ya MoMo (e.g., 078...)
    password: { type: String, required: true },
    walletBalance: { type: Number, default: 0 }, // Ifaranga rye riri muri game (RWF)
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);