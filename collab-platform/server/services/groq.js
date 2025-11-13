const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

async function summarizeDiffs(diffsText) {
	try {
		const res = await fetch('https://api.groq.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
			},
			body: JSON.stringify({
				model: 'llama-3.1-70b',
				messages: [
					{ role: 'system', content: 'Summarize code diffs into crisp commit messages with bullet points.' },
					{ role: 'user', content: diffsText }
				]
			})
		});
		const data = await res.json();
		return data?.choices?.[0]?.message?.content ?? 'Summary unavailable.';
	} catch (e) {
		return 'Summary unavailable.';
	}
}

module.exports = { summarizeDiffs };


