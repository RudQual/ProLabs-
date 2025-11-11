const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AssessmentSessionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    skill: { type: String, required: true },
    questionCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    currentQuestionText: { type: String, required: true }, // To store the question text
    currentAnswer: { type: String, required: true },
    questionType: { type: String, required: true, enum: ['mcq', 'written'] }, // 'mcq' or 'written'
    attemptCount: { type: Number, default: 0 }, // To track retries
    askedQuestions: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('AssessmentSession', AssessmentSessionSchema);