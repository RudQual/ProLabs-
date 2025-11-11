const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const AssessmentSession = require('../models/AssessmentSession');
const questionBank = require('../questionBank.json');

// Helper to save a question to the user's long-term history
async function saveToHistory(userId, questionData, skill) {
    try {
        await User.findByIdAndUpdate(userId, {
            $push: {
                assessmentHistory: {
                    questionText: questionData.question,
                    skill: skill,
                    answeredAt: new Date()
                }
            }
        });
    } catch (error) {
        console.error("Failed to save to user history:", error);
    }
}

// Helper function to get a new, unasked question from both short and long-term history
function getQuestion(skill, streak = 0, userHistory = [], askedInSession = []) {
    const difficulty = streak > 5 ? "hard" : streak > 2 ? "medium" : "easy";
    if (!questionBank[skill]) return null;

    // Get a list of questions the user has seen in the last 90 days
    const recentHistory = userHistory
        .filter(h => (Date.now() - new Date(h.answeredAt).getTime()) < 90 * 24 * 60 * 60 * 1000) // 90 days
        .map(h => h.questionText);

    // Filter out questions from the current session AND recent long-term history
    let potentialQuestions = questionBank[skill].filter(q => 
        q.difficulty === difficulty && 
        !askedInSession.includes(q.question) && 
        !recentHistory.includes(q.question)
    );
    
    // Fallback if we run out of questions of a specific difficulty
    if (potentialQuestions.length === 0) {
        potentialQuestions = questionBank[skill].filter(q => 
            !askedInSession.includes(q.question) && 
            !recentHistory.includes(q.question)
        );
    }

    if (potentialQuestions.length === 0) return null;
    return potentialQuestions[Math.floor(Math.random() * potentialQuestions.length)];
}

// Helper function to gracefully end a session
async function endSession(session, res, userId, isCorrect, correctAnswer) {
    const user = await User.findById(userId);
    const skillIndex = user.skills.findIndex(s => s.name === session.skill);

    const finalMastery = session.questionCount > 0 ? Math.round((session.correctCount / session.questionCount) * 100) : 0;
    
    if (skillIndex !== -1) user.skills[skillIndex].mastery = finalMastery;
    user.assessmentCooldownExpires = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await user.save();
    
    await AssessmentSession.deleteOne({ _id: session._id });

    const finalResponse = {
        sessionOver: true,
        finalScore: session.correctCount,
        mastery: finalMastery,
        message: session.questionCount < 30 ? `You've completed all ${session.questionCount} available questions for this topic!` : null
    };

    if (isCorrect !== undefined) {
        finalResponse.correct = isCorrect;
        finalResponse.correctAnswer = isCorrect ? null : correctAnswer;
    }

    return res.json(finalResponse);
}

// Route to START an assessment
router.post('/start', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const { skill } = req.body;

        if (user.assessmentCooldownExpires && user.assessmentCooldownExpires > new Date()) {
            return res.status(403).json({ msg: 'You are on a cooldown.', cooldownExpires: user.assessmentCooldownExpires });
        }
        if (!user.skills.some(s => s.name === skill)) {
            return res.status(400).json({ msg: 'You must have this skill on your profile to be tested on it.' });
        }

        await AssessmentSession.findOneAndDelete({ user: req.user.id });
        const questionData = getQuestion(skill, 0, user.assessmentHistory, []);
        
        if (!questionData) {
            return res.status(400).json({ msg: "Couldn't get a question for this skill." });
        }

        await saveToHistory(req.user.id, questionData, skill);
        
        const newSession = new AssessmentSession({
            user: req.user.id,
            skill: skill,
            questionCount: 1,
            correctCount: 0,
            streak: 0,
            currentQuestionText: questionData.question,
            currentAnswer: questionData.answer,
            questionType: questionData.type,
            attemptCount: 0,
            askedQuestions: [questionData.question]
        });
        await newSession.save();

        res.json({
            question: questionData.question,
            options: questionData.options,
            skill: skill,
            type: questionData.type
        });
    } catch (err) {
        console.error("Error starting assessment:", err);
        res.status(500).send('Server Error');
    }
});

// Route to SUBMIT an answer
router.post('/submit', auth, async (req, res) => {
    try {
        const { userAnswer } = req.body;
        const session = await AssessmentSession.findOne({ user: req.user.id });
        const user = await User.findById(req.user.id);

        if (!session) { return res.status(400).json({ msg: 'No active assessment session found. Please start again.' }); }

        let isCorrect = false;
        
        if (session.questionType === 'written') {
            session.attemptCount++;
            const keywords = session.currentAnswer.toLowerCase().split(' ').filter(k => k.length > 3);
            isCorrect = keywords.every(k => userAnswer.toLowerCase().includes(k));
            
            if (!isCorrect && session.attemptCount < 3) {
                await session.save();
                return res.json({ correct: false, tryAgain: true, feedback: `Not quite. You have ${3 - session.attemptCount} chance(s) left. Try again.` });
            }
        } else {
            isCorrect = userAnswer === session.currentAnswer;
        }

        const correctAnswer = session.currentAnswer;
        if (isCorrect) {
            session.correctCount++;
            session.streak++;
        } else {
            session.streak = 0;
        }

        if (session.questionCount >= 30) {
            return endSession(session, res, req.user.id, isCorrect, correctAnswer);
        }

        const nextQuestionData = getQuestion(session.skill, session.streak, user.assessmentHistory, session.askedQuestions);
        if (!nextQuestionData) {
            return endSession(session, res, req.user.id, isCorrect, correctAnswer);
        }
        
        await saveToHistory(req.user.id, nextQuestionData, session.skill);

        session.questionCount++;
        session.currentAnswer = nextQuestionData.answer;
        session.currentQuestionText = nextQuestionData.question;
        session.questionType = nextQuestionData.type;
        session.attemptCount = 0;
        session.askedQuestions.push(nextQuestionData.question);
        await session.save();

        res.json({
            correct: isCorrect,
            correctAnswer: isCorrect ? null : correctAnswer,
            sessionOver: false,
            nextQuestion: {
                question: nextQuestionData.question,
                options: nextQuestionData.options,
                type: nextQuestionData.type
            }
        });

    } catch (err) {
        console.error("Error submitting answer:", err);
        await AssessmentSession.findOneAndDelete({ user: req.user.id });
        res.status(500).send('Server Error');
    }
});

// Route to SKIP a question
router.post('/skip', auth, async (req, res) => {
    try {
        const session = await AssessmentSession.findOne({ user: req.user.id });
        const user = await User.findById(req.user.id);
        if (!session) { return res.status(400).json({ msg: 'No active assessment session found.' }); }
        
        if (session.questionCount >= 30) {
            return endSession(session, res, req.user.id);
        }
        
        const nextQuestionData = getQuestion(session.skill, session.streak, user.assessmentHistory, session.askedQuestions);
        if (!nextQuestionData) {
            return endSession(session, res, req.user.id);
        }

        await saveToHistory(req.user.id, nextQuestionData, session.skill);

        session.questionCount++;
        session.currentAnswer = nextQuestionData.answer;
        session.currentQuestionText = nextQuestionData.question;
        session.questionType = nextQuestionData.type;
        session.attemptCount = 0;
        session.askedQuestions.push(nextQuestionData.question);
        await session.save();

        res.json({
            sessionOver: false,
            nextQuestion: {
                question: nextQuestionData.question,
                options: nextQuestionData.options,
                type: nextQuestionData.type
            }
        });
    } catch(err) {
        console.error("Error skipping question:", err);
        await AssessmentSession.findOneAndDelete({ user: req.user.id });
        res.status(500).send('Server Error');
    }
});

module.exports = router;