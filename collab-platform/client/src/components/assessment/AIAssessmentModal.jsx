import React, { useState } from 'react';
import axios from 'axios';


const AIAssessmentModal = ({ onClose, userSkills }) => {
    const [chat, setChat] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [sessionState, setSessionState] = useState('idle'); // idle, active, finished
    const [selectedSkill, setSelectedSkill] = useState(userSkills.length > 0 ? userSkills[0].name : '');
    const [progress, setProgress] = useState({ current: 1, total: 30 });
    const [writtenAnswer, setWrittenAnswer] = useState("");
    const [questionForRetry, setQuestionForRetry] = useState(null);

    const handleStart = async () => {
        setIsLoading(true);
        setCurrentQuestion(null);
        setChat([]);
        try {
            const res = await axios.post('/api/assessment/start', { skill: selectedSkill });
            const { question, options, skill, type } = res.data;
            
            setChat([{ type: 'bot', text: `Okay, let's test your skills in ${skill}. Here is question 1 of 30:` }]);
            const questionObject = { question, options, type };
            setCurrentQuestion(questionObject);
            setQuestionForRetry(questionObject);
            setProgress({ current: 1, total: 30 });
            setSessionState('active');
        } catch (err) {
            console.error("Error starting assessment:", err);
            const errorMsg = err.response?.data?.msg || 'Failed to start assessment.';
            setChat([{ type: 'bot', text: `Error: ${errorMsg}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const processNextStep = (resData) => {
        const { sessionOver, nextQuestion, finalScore, mastery } = resData;
        if (sessionOver) {
            setChat(prev => [...prev, { type: 'bot', text: `Assessment complete! You scored ${finalScore} out of 30. Your new mastery for this skill is ${mastery}%.` }]);
            setSessionState('finished');
            setIsLoading(false);
        } else {
            const newProgress = progress.current + 1;
            setProgress({ ...progress, current: newProgress });
            setTimeout(() => {
                setChat(prev => [...prev, { type: 'bot', text: `Here's question ${newProgress} of 30:` }]);
                setCurrentQuestion(nextQuestion);
                setQuestionForRetry(nextQuestion);
                setIsLoading(false);
            }, 2000);
        }
    };

    const handleSendAnswer = async (answer) => {
        if (isLoading) return;
        setIsLoading(true);
        setChat(prev => [...prev, { type: 'user', text: answer }]);

        try {
            const res = await axios.post('/api/assessment/submit', { userAnswer: answer });
            const { correct, correctAnswer, tryAgain, feedback } = res.data;

            if (tryAgain) {
                setChat(prev => [...prev, { type: 'bot', text: feedback }]);
                setIsLoading(false); // Re-enable UI for another try
                setCurrentQuestion(questionForRetry);
                setWrittenAnswer("");
            } else {
                setCurrentQuestion(null);
                if (questionForRetry && questionForRetry.type === 'written') setWrittenAnswer("");
                
                const resultFeedback = correct ? "Correct!" : `Not quite. The correct answer was: ${correctAnswer}`;
                setChat(prev => [...prev, { type: 'bot', text: resultFeedback }]);
                processNextStep(res.data);
            }
        } catch (err) {
            console.error("Error submitting answer:", err);
            setChat(prev => [...prev, { type: 'bot', text: 'Sorry, there was an error processing your answer.' }]);
            setIsLoading(false);
        }
    };

    const handleSkipQuestion = async () => {
        if(isLoading) return;
        setIsLoading(true);
        setChat(prev => [...prev, { type: 'user', text: "(Skipped Question)" }]);
        setCurrentQuestion(null);

        try {
            const res = await axios.post('/api/assessment/skip');
            processNextStep(res.data);
        } catch (err) {
            console.error("Error skipping question:", err);
            setChat(prev => [...prev, { type: 'bot', text: 'Sorry, there was an error skipping the question.' }]);
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>AI Skill Assessment {sessionState === 'active' && `(${progress.current}/${progress.total})`}</h2>
                <div className="chat-window">
                    {chat.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.type}`}>{msg.text}</div>
                    ))}
                    {currentQuestion && !isLoading && (
                        <div className="question-container">
                            <div className="chat-message bot">{currentQuestion.question}</div>
                            
                            {currentQuestion.type === 'mcq' ? (
                                <div className="options-container">
                                    {currentQuestion.options.map((opt, i) => (
                                        <button key={i} onClick={() => handleSendAnswer(opt)} className="option-btn" disabled={isLoading}>
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <form onSubmit={(e) => { e.preventDefault(); handleSendAnswer(writtenAnswer); }} className="written-answer-form">
                                    <textarea
                                        value={writtenAnswer}
                                        onChange={(e) => setWrittenAnswer(e.target.value)}
                                        placeholder="Type your answer here..."
                                        rows="4"
                                        disabled={isLoading}
                                    ></textarea>
                                    <button type="submit" className="btn" disabled={isLoading || !writtenAnswer}>Submit Answer</button>
                                </form>
                            )}
                        </div>
                    )}
                    {isLoading && <div className="chat-message bot">Thinking...</div>}
                </div>
                <div className="modal-actions">
                    {sessionState === 'idle' && (
                        <>
                            <select value={selectedSkill} onChange={e => setSelectedSkill(e.target.value)} disabled={userSkills.length === 0}>
                                {userSkills.length > 0 ? 
                                    userSkills.map(s => <option key={s.name} value={s.name}>{s.name}</option>) :
                                    <option>Please add skills to your profile first</option>
                                }
                            </select>
                            <button className="btn" onClick={handleStart} disabled={userSkills.length === 0}>Start</button>
                        </>
                    )}
                     {sessionState === 'active' && !isLoading && (
                         <button type="button" className="btn-secondary" onClick={handleSkipQuestion}>Skip</button>
                    )}
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        {sessionState === 'finished' ? 'Finish' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIAssessmentModal;