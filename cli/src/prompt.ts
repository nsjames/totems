import readline from "readline";

export const confirm = async (question: string): Promise<boolean> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(`${question} (y/N) `, answer => {
            rl.close();
            resolve(answer.toLowerCase() === "y");
        });
    });
};