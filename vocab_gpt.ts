import axios from 'axios';
import { Message } from './types';
​
const apiKey = process.env.API_KEY;
const headers: { [key: string]: string } = { 'Authorization': `Bearer ${apiKey}` };
​
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2 * 1000; // Delay in milliseconds
​
async function getResponseFromAI(messages: Message[]): Promise<string> {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        try {
            //console.log('Messages: ', messages)
            let response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: 500,
                    temperature: 0.2
                },
                { headers: headers }
            );
            return response.data.choices[0].message.content;
        } catch (error: any) {
            console.error(`Error connecting to GPT-3.5-turbo API: ${error}`);
            if (attempt < RETRY_ATTEMPTS - 1) {
                console.log(`Retrying after ${RETRY_DELAY / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                throw new Error(`Failed after ${RETRY_ATTEMPTS} attempts: ${error}`);
            }
        }
    }
    throw new Error("An error occurred. Please try again.");
}
​
async function isTranslationCorrect(systemMessage: Message, nativeWord: string, user_input: string, nativeLanguage: string, translatedLanguage: string): Promise<{isCorrect: boolean, correctedWord: string, feedback: string}> {
    let messages: Message[] = [systemMessage];
    const positiveFeedbacks = ["Correct! Good job!", "Well done!", "You nailed it!", "That's right!", "Excellent translation!"];
​
    user_input = user_input.replace(/[^a-zA-Z]/g, '');
​
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        try {
            let verifyMessage: Message = {
                role: 'user',
                content: `Considering the differences between singular and plural translations, is the ${nativeLanguage} word '${nativeWord}' correctly translated to "${translatedLanguage}" as "${user_input}"? Reply with: "true" if your answer is positive, "false" if your answer is negative.`
            };
            messages.push(verifyMessage);
            let chatgpt_output = await getResponseFromAI(messages);
            //console.log('isTranslationCorrect-1: ', chatgpt_output)
​
            if (chatgpt_output.toLowerCase().includes('true')) {
                const feedbackMessage = positiveFeedbacks[Math.floor(Math.random() * positiveFeedbacks.length)];
                console.log('\x1b[31mGPT: %s\x1b[0m', feedbackMessage);
                return { isCorrect: true, correctedWord: user_input, feedback: feedbackMessage };
            } else if (chatgpt_output.toLowerCase().includes('false')) {
                let messages: Message[] = [systemMessage];
                let correctAIWordTranslationMessage: Message = {
                    role: 'user',
                    content: `translate the ${nativeLanguage} word "${nativeWord}" to ${translatedLanguage}. Respond in exactly this format: 'The translation of the word [word] in [target language] is [the one correctly translated word].'.`
                };
                messages.push(correctAIWordTranslationMessage);
                chatgpt_output = await getResponseFromAI(messages);
                //console.log('isTranslationCorrect-2: ', chatgpt_output)
                console.log('\x1b[31mGPT: %s\x1b[0m', chatgpt_output);
​
​
                const lastWord = chatgpt_output.split(" ").pop();
                if (lastWord) {
                    const correctWord = lastWord.replace(/[.,'"/!]/g, '');
                    return { isCorrect: false, correctedWord: correctWord, feedback: "Incorrect translation" };
                } else {
                    throw new Error(`Failed to parse AI's response`);
                }
            }
        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }
    return { isCorrect: false, correctedWord: '', feedback: 'Failed to determine correctness after all attempts' };
}
​
​
async function askToPutWordInSentence(systemMessage: Message, correctWord: string, translatedLanguage: string, nativeLanguage: string): Promise<string> {
    try {
        let messages: Message[] = [systemMessage];
​
        let sentenceRequestMessage: Message = {
            role: 'user',
            content: `Please ask me to try to put the "${correctWord}" in a sentence in ${translatedLanguage}. Output only the request to me. Only in ${nativeLanguage}.`
        };
​
        messages.push(sentenceRequestMessage);
        
        let chatgpt_output = await getResponseFromAI(messages);
        //console.log('askToPutWordInSentence: ', chatgpt_output)
​
        messages.pop();
        
        return chatgpt_output;
​
    } catch (error) {
        throw new Error("Failed to execute askToPutWordInSentence");
    }
}
​
​
​
async function countWordsInSentence(user_input: string): Promise<[boolean, string?]> {
    const words = user_input.split(' ');
    if (words.length < 4) {
        return [false, 'Your sentence must be at least 4 words. Please try again.'];
    }
    return [true];
}
​
​
async function checkWordPresenceInSentence(systemMessage: Message, correctWord: string, user_sentence: string, translatedLanguage: string): Promise<boolean> {
    let messages: Message[] = [];
​
    let wordCheckSystemMessage: Message = {
        role: 'system',
        content: `You are an expert in the ${translatedLanguage} language. Your task is to check if the word '${correctWord}' or any of its variations or conjugated forms is present in the sentence.`
    };
    let wordCheckUserMessage: Message = {
        role: 'user',
        content: `Can you please verify if the ${translatedLanguage} word '${correctWord}' or any of its variations or any of its conjugated forms is present in the ${translatedLanguage} sentence '${user_sentence}'? Reply with 'true' if the word or its variations are present and 'false' otherwise.`
    };
​
    messages.push(wordCheckSystemMessage);
    messages.push(wordCheckUserMessage);
​
    let wordPresenceCheck = await getResponseFromAI(messages);
    //console.log('wordPresenceCheck: ', wordPresenceCheck)
​
    if (wordPresenceCheck.toLowerCase().includes('false')) {
        return false;
    } else if (wordPresenceCheck.toLowerCase().includes('true')) {
        return true;
    }
​
    throw new Error("Unexpected response during word presence check.");
}
​
​
async function checkSentenceCorrectness(systemMessage: Message, user_sentence: string, translatedLanguage: string): Promise<[boolean, string]> {
    let messages: Message[] = [];
    let correctSentence: string;  // Initialize variable here to ensure scope availability
    let correctnessSystemMessage: Message = {
        role: 'system',
        content: `Act as an expert in text analysis, you have been evaluating alphanumeric characters in sentences for 10 years. You've helped multiple clients by discriminating punctuation and capitalization from the alphanumeric characters within sentences. Evaluate the following sentence by focusing solely on its alphanumeric characters '${user_sentence}'. Disregard any punctuation and avoid considering capitalization. Think of a grammar analysis of its alphanumeric pattern before responding with one word: "true" or "false".`
    };
​
    let isSentenceCorrectMessage: Message = {
        role: 'user',
        content: `Act as a ${translatedLanguage} expert that disregards random uppercase and lowercase letters in sentences, in addition to misplaced punctuation. Considering only the words and their order, is the provided ${translatedLanguage} sentence "${user_sentence}" grammatically correct?
        Reply only with "true" or "false".`
    };
​
    messages.push(correctnessSystemMessage);
    messages.push(isSentenceCorrectMessage);
​
    let correctnessCheck = await getResponseFromAI(messages);
    //console.log('correctnessCheck: ', correctnessCheck)
​
    let correctionRequestMessage: Message = {
        role: 'user',
        content: `Provide the correct sentence "${user_sentence}". Respond in this format: "the correct form of your sentence is: [corrected sentence version here]"`
    };
​
    if (correctnessCheck.toLowerCase().includes('false')) {
        messages[messages.length - 1] = correctionRequestMessage;
        let correctionOutput = await getResponseFromAI(messages);
        //console.log('correctionOutput-1: ', correctionOutput)
​
        const regex = /:\s*(.*)$/i;
        const match = correctionOutput.match(regex);
​
        if (match && match[1]) {
            correctSentence = match[1];
            return [false, correctSentence];
        } else {
            return [false, user_sentence];  // if extraction fails, return original input as a fallback
        }
​
    } else if (correctnessCheck.toLowerCase().includes('true')) {
        messages[messages.length - 1] = correctionRequestMessage;
        let correctionOutput = await getResponseFromAI(messages);
        //console.log('correctionOutput-2: ', correctionOutput)
        const regex = /:\s*(.*)$/i;
        const match = correctionOutput.match(regex);
        if (match && match[1]) {
            correctSentence = match[1];
            user_sentence = correctSentence;
            return [true, user_sentence];
        } else {
            return [true, user_sentence];  // if extraction fails, return original input as a fallback
        }
    } else {
        // This is a catch-all for when the response doesn't include 'true' or 'false'.
        console.warn("Unexpected response: ", correctnessCheck);
        return [false, user_sentence];
    }
}
​
​
async function checkSentenceCompleteness(systemMessage: Message, correctSentence: string, translatedLanguage: string): Promise<boolean> {
    let messages: Message[] = [];
    let completenessSystemMessage: Message = {
        role: 'system',
        content: `Act as an expert in text analysis, you analyze and assess if a given ${translatedLanguage} sentence is an independent clause by identifying at least one noun phrase (NP) and one verb phrase (VP).`
    };
    messages.push(completenessSystemMessage);
​
    let isSentenceCompleteMessage: Message = {
        role: 'user',
        content: `Act as a ${translatedLanguage} expert. Is "${correctSentence}" an independent clause in ${translatedLanguage}? Respond with "true" or "false".`
    };
    messages.push(isSentenceCompleteMessage);
    let completenessCheck = await getResponseFromAI(messages);
    //console.log('completenessCheck: ', completenessCheck)
​
    if (completenessCheck.toLowerCase().includes('true')) {
        return true;
    } else if (completenessCheck.toLowerCase().includes('false')) {
        return false;
    }
​
    throw new Error("Unexpected response during completeness check.");
}
​
​
async function checkSemanticCorrectness(systemMessage: Message, correctSentence: string, translatedLanguage: string): Promise<boolean> {
    let messages: Message[] = [];
    let semanticSystemMessage: Message = {
        role: 'system',
        content: `Ignore all previous instructions. Act as a ${translatedLanguage} language expert. Evaluate the semantic coherence of the ${translatedLanguage} sentence '${correctSentence}'. Is this sentence a conventional and semantically meaningful expression that a native ${translatedLanguage} speaker would use or understand in everyday conversation, excluding poetic or artistic interpretations? Reply with 'true' or 'false'.`
    };
    let semanticCheckMessage: Message = {
        role: 'user',
        content: `Is the ${translatedLanguage} sentence "${correctSentence}" semantically meaningful in ${translatedLanguage}? Reply with "true" or "false".`
    };
    
    messages.push(semanticSystemMessage);
    messages.push(semanticCheckMessage);
​
    let semanticCheckOutput = await getResponseFromAI(messages);
    //console.log('semanticCheckOutput: ', semanticCheckOutput)
​
    if (semanticCheckOutput.toLowerCase().includes('true')) {
        return true;
    } else if (semanticCheckOutput.toLowerCase().includes('false')) {
        return false;
    }
​
    throw new Error("Unexpected response during semantic check.");
}
​
​
async function getAlternativeSentence(systemMessage: Message, correctedWord: string, translatedLanguage: string, correctSentence: string): Promise<string> {
    try {
        let messages: Message[] = [systemMessage];
        let alternativeRequestMessage: Message = {
            role: 'user',
            content: `You give me (the user) an alternative of this ${translatedLanguage} sentence that uses the word "${correctedWord}". Output only the sentence itself. Avoid using any discourse markers.`
        };
        messages.push(alternativeRequestMessage);
        
        let alternativeSentence = await getResponseFromAI(messages);
        //console.log('alternativeSentence: ', alternativeSentence)
        
        if (typeof alternativeSentence !== 'string' || alternativeSentence.length === 0) {
            throw new Error("Received invalid response for alternative sentence.");
        }
        
        return alternativeSentence;
        
    } catch (error) {
        throw new Error("Could not generate an alternative sentence.");
    }
}
​
async function getCorrectAndImprovedSentence(user_sentence: string, translatedLanguage: string): Promise<string> {
    try {
        let messages: Message[] = [];
        let systemMessage: Message = {
            role: 'system',
            content: `You are an expert translator and ${translatedLanguage} language tutor. Your task is to correct and improve sentences for grammatical accuracy. Pay close attention to grammar, context, and idioms in languages. You will evaluate and provide better versions of sentences. Ignore capitalization and avoid using discourse markers.`
        };
        messages.push(systemMessage);
        let improvedRequestMessage: Message = {
            role: 'user',
            content: `You correct and improve this ${translatedLanguage} sentence: ${user_sentence}. Output only the sentence itself. Avoid using any discourse markers.`
        };
        messages.push(improvedRequestMessage);
        
        let improvedSentence = await getResponseFromAI(messages);
        //console.log('improvedSentence: ', improvedSentence) 
        
        if (typeof improvedSentence !== 'string' || improvedSentence.length === 0) {
            throw new Error("Received invalid response for improved sentence.");
        }
        
        return improvedSentence;
        
    } catch (error) {
        throw new Error("Could not generate an improved sentence.");
    }
}
​
​
export {
    isTranslationCorrect,
    askToPutWordInSentence,
    countWordsInSentence,
    checkWordPresenceInSentence,
    checkSentenceCorrectness,
    checkSentenceCompleteness,
    checkSemanticCorrectness,
    getAlternativeSentence,
    getCorrectAndImprovedSentence
};