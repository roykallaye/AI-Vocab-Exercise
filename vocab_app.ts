import express, { Request, Response } from 'express';
import readline from 'readline';
import { 
    isTranslationCorrect, 
    askToPutWordInSentence, 
    countWordsInSentence,
    checkWordPresenceInSentence,
    checkSentenceCorrectness,
    checkSentenceCompleteness,
    checkSemanticCorrectness,
    getAlternativeSentence,
    getCorrectAndImprovedSentence
} from './vocab_gpt';

require('dotenv').config();

const app = express();
const port = 3000;
​
app.get('/', (req: Request, res: Response) => res.send('Hello World!'));
​
const server = app.listen(port, () => {});
​
server.on('error', (error: Error) => {
    console.error(`Error: ${error}`);
});
​
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
​
const getUserInputAsync = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, (user_input: string) => {
            resolve(user_input);
        });
    });
};
​
const displayOutput = (message: string) => {
    const red = '\x1b[31m';
    console.log(`${red}GPT: ${message}`);
};
​
(async () => {
    const native_language: string = 'English';
    const target_language: string = 'Italian';
    const words: string[] = ['apple', 'run', 'dog', 'write', 'book', 'dance', 'tree', 'jump', 'ocean', 'swim', 'cat', 'sing', 'on', 'with', 'under'];
    let currentIndex = 0;
    let correctedSentence: string = "";
​
    let systemMessage = {
        role: "system",
        content: `You are an expert translator and language tutor. If I provide you the translation of a word in a different form (singular/plural), you never accept the plural translation of a singular word, and vice versa. You pay attention, consider, and give particular importance to the nuances of grammar, context, and idioms in languages. You check and evaluate my translation of ${native_language} words into ${target_language}. You will also check and give feedback on my sentences, always in ${native_language}. Ignore letter capitalization. Refrain from only translating my sentence. You are prohibited from using a language other than ${native_language} at all times.`
    };
​
    console.log('\x1b[31m%s\x1b[0m', `Hi there! Let's practice some vocabulary.`);
    console.log('\x1b[31m%s\x1b[0m', 'I will give you some words in ' + native_language + '.');
    console.log('\x1b[31m%s\x1b[0m', 'Your task is to translate these words into ' + target_language + '.');
    console.log('\x1b[31m%s\x1b[0m', 'Are you ready? Let\'s start!\n');
​
​
    while (true) {
        const nativeWord = words[currentIndex];
        console.log(`     '${nativeWord}'`);
​
        let user_input = await getUserInputAsync('USER: ');
​
        while (user_input.trim() === '') {
            console.log('GPT: Please provide a translation.');
            user_input = await getUserInputAsync('USER: ');
        }
        
        const { correctedWord } = await isTranslationCorrect(systemMessage, nativeWord, user_input, native_language, target_language);
        const sentenceRequest = await askToPutWordInSentence(systemMessage, correctedWord, target_language, native_language);
        console.log('\x1b[31m    %s\x1b[0m', sentenceRequest);
​
        let user_sentence = await getUserInputAsync('USER (sentence): ');
​
        let validityResult = await countWordsInSentence(user_sentence);
        while (!validityResult[0]) {
            console.log('GPT:', validityResult[1]);
            user_sentence = await getUserInputAsync('USER (sentence): ');
            validityResult = await countWordsInSentence(user_sentence);
        }
​
        let retryCount = 0;
        let isWordPresent = false;
​
        do {
            if (retryCount > 0) { 
                displayOutput(`Oops! It looks like you forgot to include the word '${correctedWord}' in your sentence. Would you like to try again?`);
                user_sentence = await getUserInputAsync('USER (sentence): ');
            }
        
            isWordPresent = await checkWordPresenceInSentence(systemMessage, correctedWord, user_sentence, target_language);
        
            if (isWordPresent) break; 
        
            retryCount++;
        
        } while (retryCount < 2);
        
        
        let caseType: "sentenceCorrect && complete && semantic" | "sentenceCorrect && notComplete" | "sentenceCorrect && complete && nonSemantic" | "sentenceWrong" | "wordNotUsed" | "error";
        if (!isWordPresent) {
            caseType = "wordNotUsed";
        } else {
            const [isCorrect, correctedSentence] = await checkSentenceCorrectness(systemMessage, user_sentence, target_language);
            user_sentence = correctedSentence;
​
            let isComplete = false;
​
            if (isCorrect) {
                isComplete = await checkSentenceCompleteness(systemMessage, correctedSentence, target_language);
            }
            
            let isSemantic = false;
            
            if (isComplete) {
                isSemantic = await checkSemanticCorrectness(systemMessage, correctedSentence, target_language);
            }
            
            switch (true) {
                case !isCorrect:
                    caseType = "sentenceWrong";
                    break;
                case isCorrect && !isComplete:
                    caseType = "sentenceCorrect && notComplete";
                    break;
                case isCorrect && isComplete && !isSemantic:
                    caseType = "sentenceCorrect && complete && nonSemantic";
                    break;
                case isCorrect && isComplete && isSemantic:
                    caseType = "sentenceCorrect && complete && semantic";
                    break;
                default:
                    caseType = "error";
            }            
        }
    
        switch (caseType) {
            case "wordNotUsed":
                displayOutput("It looks like you didn't include the given word in your sentence.");
                const alt0 = await getAlternativeSentence(systemMessage, correctedWord, target_language, correctedSentence);
                displayOutput(`     Here's how you might use the word in a sentence: ${alt0}`);
                break;
​
            case "sentenceCorrect && complete && semantic":
                displayOutput(`Great job! Your sentence "${user_sentence}" is spot-on`);
                //console.log("     Sentence:", user_sentence);
                break;
            
            case "sentenceWrong":
                displayOutput(`Almost there! Your sentence "${user_sentence}" needs a little tweaking for grammatical accuracy.`);
                //const alt4 = await getAlternativeSentence(systemMessage, correctedWord, target_language, correctedSentence);
                const alt4 = await getCorrectAndImprovedSentence(user_sentence, target_language);
                displayOutput(`A possible correct sentence could be: ${alt4}`);
                break;
    
            case "sentenceCorrect && notComplete":
                displayOutput(`You're on the right track! Your sentence "${user_sentence}" is almost complete.`);
                const alt2 = await getAlternativeSentence(systemMessage, correctedWord, target_language, correctedSentence);
                displayOutput(`     Consider this more complete version: ${alt2}`);
                break;
    
            case "sentenceCorrect && complete && nonSemantic":
                displayOutput(`You've got the grammar down, but your sentence "${user_sentence}" doesn't quite make sense. Let's refine it.`);
                const alt3 = await getAlternativeSentence(systemMessage, correctedWord, target_language, correctedSentence);
                displayOutput(`     How about this meaningful version: ${alt3}`);
                break;
    
            case "error":
                displayOutput("Oops! Something went wrong on our end. Please try again later, or contact support if the issue persists.");
                break;
        }
    
        currentIndex = (currentIndex + 1) % words.length;
    }        
})();