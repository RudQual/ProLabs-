const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FileSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    content: {
        type: String,
        default: ''
    },
    project: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    isFolder: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Ensure that a file path is unique within a single project
FileSchema.index({ project: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('File', FileSchema);