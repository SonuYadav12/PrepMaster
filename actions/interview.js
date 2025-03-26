"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// export async function generateQuiz() {
//   const { userId } = await auth();
//   if (!userId) throw new Error("Unauthorized");

//   const user = await db.user.findUnique({
//     where: { clerkUserId: userId },
//     select: {
//       industry: true,
//       skills: true,
//     },
//   });

//   if (!user) throw new Error("User not found");

//   const prompt = `
//     Generate 10 technical interview questions for a ${
//       user.industry
//     } professional${
//     user.skills?.length ? ` with expertise in ${user.skills.join(", ")}` : ""
//   }.
    
//     Each question should be multiple choice with 4 options.
    
//     Return the response in this JSON format only, no additional text:
//     {
//       "questions": [
//         {
//           "question": "string",
//           "options": ["string", "string", "string", "string"],
//           "correctAnswer": "string",
//           "explanation": "string"
//         }
//       ]
//     }
//   `;

//   try {
//     const result = await model.generateContent(prompt);
//     const response = result.response;
//     const text = response.text();
//     const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
//     const quiz = JSON.parse(cleanedText);

//     return quiz.questions;
//   } catch (error) {
//     console.error("Error generating quiz:", error);
//     throw new Error("Failed to generate quiz questions");
//   }
// }

// export async function saveQuizResult(questions, answers, score) {
//   const { userId } = await auth();
//   if (!userId) throw new Error("Unauthorized");

//   const user = await db.user.findUnique({
//     where: { clerkUserId: userId },
//   });

//   if (!user) throw new Error("User not found");

//   const questionResults = questions.map((q, index) => ({
//     question: q.question,
//     answer: q.correctAnswer,
//     userAnswer: answers[index],
//     isCorrect: q.correctAnswer === answers[index],
//     explanation: q.explanation,
//   }));

//   // Get wrong answers
//   const wrongAnswers = questionResults.filter((q) => !q.isCorrect);

//   // Only generate improvement tips if there are wrong answers
//   let improvementTip = null;
//   if (wrongAnswers.length > 0) {
//     const wrongQuestionsText = wrongAnswers
//       .map(
//         (q) =>
//           `Question: "${q.question}"\nCorrect Answer: "${q.answer}"\nUser Answer: "${q.userAnswer}"`
//       )
//       .join("\n\n");

//     const improvementPrompt = `
//       The user got the following ${user.industry} technical interview questions wrong:

//       ${wrongQuestionsText}

//       Based on these mistakes, provide a concise, specific improvement tip.
//       Focus on the knowledge gaps revealed by these wrong answers.
//       Keep the response under 2 sentences and make it encouraging.
//       Don't explicitly mention the mistakes, instead focus on what to learn/practice.
//     `;

//     try {
//       const tipResult = await model.generateContent(improvementPrompt);

//       improvementTip = tipResult.response.text().trim();
//       console.log(improvementTip);
//     } catch (error) {
//       console.error("Error generating improvement tip:", error);
//       // Continue without improvement tip if generation fails
//     }
//   }

//   try {
//     const assessment = await db.assessment.create({
//       data: {
//         userId: user.id,
//         quizScore: score,
//         questions: questionResults,
//         category: "Technical",
//         improvementTip,
//       },
//     });

//     return assessment;
//   } catch (error) {
//     console.error("Error saving quiz result:", error);
//     throw new Error("Failed to save quiz result");
//   }
// }

export async function getAssessments() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  try {
    const assessments = await db.assessment.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return assessments;
  } catch (error) {
    console.error("Error fetching assessments:", error);
    throw new Error("Failed to fetch assessments");
  }
}



export async function generateQuiz(selectedTopics = [], customTopics = []) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: {
      industry: true,
      skills: true, // Fetch stored skills
    },
  });

  if (!user) throw new Error("User not found");

  // Merge predefined topics, user skills, and custom topics
  const combinedTopics = [...new Set([...(user.skills || []), ...selectedTopics, ...customTopics])];

  if (combinedTopics.length === 0) throw new Error("No topics selected!");

  const prompt = `
    Generate 10 technical interview questions for a ${user.industry} professional 
    covering the following topics: ${combinedTopics.join(", ")}.

    Each question should be multiple choice with 4 options.
    Include the topic for each question.
    
    Return the response in this JSON format only, no additional text:
    {
      "questions": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correctAnswer": "string",
          "explanation": "string",
          "topic": "string"
        }
      ]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    const quiz = JSON.parse(cleanedText);

    return quiz.questions;
  } catch (error) {
    console.error("Error generating quiz:", error);
    throw new Error("Failed to generate quiz questions");
  }
}

export async function saveQuizResult(questions, answers, score) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  const questionResults = questions.map((q, index) => ({
    question: q.question,
    answer: q.correctAnswer,
    userAnswer: answers[index] || "No Answer",
    isCorrect: q.correctAnswer === answers[index],
    explanation: q.explanation || "No explanation available",
    topic: q.topic || "General",
  }));

  // Identify weak topics
  const weakTopics = [
    ...new Set(questionResults.filter((q) => !q.isCorrect).map((q) => q.topic)),
  ].join(", "); // Convert array to a comma-separated string (if needed)

  // Generate improvement tip
  let improvementTip = "Keep practicing and review your weak topics.";
  if (weakTopics.length > 0) {
    const improvementPrompt = `
      The user struggled with the following topics: ${weakTopics}.
      Provide a short, motivating improvement tip for these topics.
      Keep it under 2 sentences.
    `;

    try {
      const tipResult = await model.generateContent(improvementPrompt);
      improvementTip = tipResult.response.text().trim() || improvementTip;
    } catch (error) {
      console.error("Error generating improvement tip:", error);
    }
  }

  try {
    console.log("Saving quiz result:", {
      userId: user.id,
      quizScore: score,
      questions: questionResults,
      // weakTopics: weakTopics,  // ❌ REMOVE this if it causes errors
      improvementTip,
    });

    const assessment = await db.assessment.create({
      data: {
        userId: user.id,
        quizScore: score,
        questions: questionResults,
        category: "Technical",
        // weakTopics, // ❌ REMOVE this line if Prisma doesn't support it
        improvementTip,
      },
    });

    return assessment;
  } catch (error) {
    console.error("Error saving quiz result:", error);
    throw new Error("Failed to save quiz result");
  }
}


export async function getWeakTopics() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    const assessments = await db.assessment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5, // Get last 5 quizzes for weak topics
    });

    // Collect all weak topics from recent assessments
    let weakTopics = [];
    assessments.forEach((assessment) => {
      if (assessment.weakTopics) {
        weakTopics = [...weakTopics, ...assessment.weakTopics];
      }
    });

    console.log("📊 Retrieved Weak Topics:", weakTopics); // Debug log

    return weakTopics.length > 0 ? weakTopics : []; // Ensure an array is always returned
  } catch (error) {
    console.error("❌ Error fetching weak topics:", error);
    return []; // Instead of throwing an error, return an empty array
  }
}


