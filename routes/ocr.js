const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { image_data } = req.body;
  if (!image_data) return res.status(400).json({ error: 'No image provided' });

  try {
	const base64 = image_data.split(',')[1];
	const mediaType = image_data.split(';')[0].split(':')[1];
	console.log('Calling Anthropic, mediaType:', mediaType, 'base64 length:', base64 ? base64.length : 0);

	const response = await fetch('https://api.anthropic.com/v1/messages', {
	  method: 'POST',
	  headers: {
		'Content-Type': 'application/json',
		'x-api-key': process.env.ANTHROPIC_API_KEY,
		'anthropic-version': '2023-06-01',
	  },
	  body: JSON.stringify({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 256,
		messages: [{
		  role: 'user',
		  content: [
			{
			  type: 'image',
			  source: { type: 'base64', media_type: mediaType, data: base64 }
			},
			{
			  type: 'text',
			  text: 'Look carefully at this receipt for any date printed on it. Extract the following and respond ONLY with valid JSON, no other text, no markdown: {"vendor": "store or restaurant name", "date": "any date found on the receipt in YYYY-MM-DD format, or empty string if no date visible", "amount": the total amount as a number or null, "category": "one of: Meals, Transportation, Equipment, Lodging, Supplies, Venue, Other"}'
			}
		  ]
		}]
	  })
	});

	console.log('Anthropic status:', response.status);
	const data = await response.json();
	console.log('OCR response:', JSON.stringify(data).slice(0, 300));

	// Handle API errors
	if (data.type === 'error') {
	  console.warn('Anthropic error:', data.error.message);
	  return res.status(402).json({ error: data.error.message });
	}

	const text = data.content[0].text.trim().replace(/^```json\s*/,'').replace(/\s*```$/,'');
	const parsed = JSON.parse(text);
	res.json(parsed);
 } catch (err) {
	 console.error('OCR error full:', err.message, err.stack);
	 res.status(500).json({ error: 'OCR failed', detail: err.message });
   }
});

module.exports = router;