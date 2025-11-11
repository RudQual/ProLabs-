const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoomSchema = new Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    projects: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    
    // --- ADD THESE NEW FIELDS ---
    isPublic: {
        type: Boolean,
        default: true
    },
    joinRequests: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);