const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = 'AIzaSyDe4UxKwnDmH6lxMRmC9RbiZsLQhnkAX2k';
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

module.exports = model;
