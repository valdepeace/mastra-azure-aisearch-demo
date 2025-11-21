/**
 * Script to populate the knowledge index with sample data
 *
 * This script creates an index in Azure AI Search and fills it with
 * sample articles on different topics.
 */

import 'dotenv/config';
import { AzureAISearchVector } from '@mastra/aisearch';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

// Example data for the knowledge base (all in English)
const sampleDocuments = [
  {
    title: 'Introduction to Artificial Intelligence',
    content: `Artificial Intelligence (AI) is a branch of computer science that aims to create systems capable of performing tasks that normally require human intelligence. This includes learning, reasoning, perception, natural language processing, and decision-making. Modern AI systems use machine learning and deep learning techniques to improve their performance over time.`,
    category: 'technology',
    tags: ['AI', 'machine learning', 'technology'],
  },
  {
    title: 'Vector Databases',
    content: `Vector databases are specialized systems for storing and searching vector embeddings. Unlike traditional databases that use text or numeric indexes, vector databases enable searches by semantic similarity. This is fundamental for AI applications such as recommendation systems, semantic search, and retrieval-augmented generation (RAG).`,
    category: 'technology',
    tags: ['databases', 'vectors', 'embeddings'],
  },
  {
    title: 'Azure AI Search: Cognitive Search',
    content: `Azure AI Search is a cloud search service that provides semantic, vector, and full-text search capabilities. It allows you to index large volumes of data and perform searches using natural language processing. It is ideal for implementing RAG (Retrieval Augmented Generation) systems and applications that require intelligent search.`,
    category: 'technology',
    tags: ['Azure', 'search', 'cloud'],
  },
  {
    title: 'Embeddings and Semantic Representation',
    content: `Embeddings are vector representations of text, images, or other data that capture their semantic meaning. Models like OpenAI's text-embedding-3-small convert text into 1536-dimensional vectors, where texts with similar meanings have vectors close together in vector space. This allows comparing the meaning of texts using cosine or Euclidean distance.`,
    category: 'technology',
    tags: ['embeddings', 'NLP', 'OpenAI'],
  },
  {
    title: 'RAG Architectures (Retrieval Augmented Generation)',
    content: `RAG is an architecture that combines information retrieval with language generation. First, relevant documents are retrieved from a knowledge base using vector search, then these documents are used as context for an LLM to generate accurate and grounded responses. This reduces hallucinations and allows models to access up-to-date information.`,
    category: 'technology',
    tags: ['RAG', 'LLM', 'architecture'],
  },
  {
    title: 'Climate Change and Its Effects',
    content: `Climate change is a significant alteration of global climate patterns, mainly caused by the increase of greenhouse gases in the atmosphere. Effects include rising global temperatures, melting glaciers, more frequent extreme weather events, and changes in ecosystems. Reducing carbon emissions is crucial to mitigate these effects.`,
    category: 'science',
    tags: ['climate', 'environment', 'sustainability'],
  },
  {
    title: 'Quantum Computing: The Future of Technology',
    content: `Quantum computing uses principles of quantum mechanics such as superposition and entanglement to perform calculations. Unlike classical computers that use bits (0 or 1), quantum computers use qubits that can be in multiple states simultaneously. This promises to solve problems that are intractable for classical computers, such as large number factorization and molecular simulation.`,
    category: 'science',
    tags: ['quantum computing', 'physics', 'innovation'],
  },
  {
    title: 'Agile Methodologies in Software Development',
    content: `Agile methodologies like Scrum and Kanban revolutionized software development by focusing on short iterations, continuous collaboration, and adaptability. Instead of planning the entire project in advance, work is done in short sprints that allow priorities to be adjusted based on feedback. This results in higher quality software better aligned with user needs.`,
    category: 'business',
    tags: ['agile', 'scrum', 'software development'],
  },
  {
    title: 'Digital Marketing and SEO',
    content: `Digital marketing encompasses all promotion strategies in digital media. SEO (Search Engine Optimization) is essential to improve visibility in search engines through quality content, relevant keywords, and technical optimization. Content must be valuable to users while following SEO best practices to achieve high rankings.`,
    category: 'business',
    tags: ['marketing', 'SEO', 'digital'],
  },
  {
    title: 'Nutrition and Holistic Health',
    content: `A balanced diet is essential for maintaining health. It should include a variety of fruits, vegetables, lean proteins, whole grains, and healthy fats. Proper hydration, regular exercise, and quality sleep complement a healthy diet. Avoiding processed foods and added sugars significantly contributes to long-term well-being.`,
    category: 'health',
    tags: ['nutrition', 'well-being', 'diet'],
  },
  {
    title: 'Supervised vs Unsupervised Machine Learning',
    content: `In supervised learning, the model is trained with labeled data, learning to map inputs to known outputs. It is useful for classification and regression. Unsupervised learning works with unlabeled data, finding hidden patterns through clustering or dimensionality reduction. Each approach has its specific use cases depending on the problem to solve.`,
    category: 'technology',
    tags: ['machine learning', 'AI', 'algorithms'],
  },
  {
    title: 'TypeScript: JavaScript with Types',
    content: `TypeScript is a superset of JavaScript that adds static typing. It helps catch errors at compile time instead of runtime, improves developer experience with intelligent autocompletion, and makes it easier to maintain large-scale code. It is especially valuable in large projects with multiple developers.`,
    category: 'technology',
    tags: ['TypeScript', 'JavaScript', 'programming'],
  },
];

async function populateKnowledgeBase() {
  console.log(`\n${colors.cyan}📚 Populating Knowledge Base${colors.reset}\n`);

  // Check configuration
  if (!process.env.AZURE_AI_SEARCH_ENDPOINT || !process.env.AZURE_AI_SEARCH_CREDENTIAL) {
    console.log(
      `${colors.yellow}⚠ Error: Please configure Azure AI Search environment variables${colors.reset}\n`,
    );
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log(
      `${colors.yellow}⚠ Error: Please configure OPENAI_API_KEY to generate embeddings${colors.reset}\n`,
    );
    process.exit(1);
  }

  const vectorStore = new AzureAISearchVector({
    id: 'knowledge-base-populator',
    endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT,
    credential: process.env.AZURE_AI_SEARCH_CREDENTIAL,
  });

  const indexName = 'knowledge-base';

  try {
    // 1. Create index
    console.log(`${colors.blue}→${colors.reset} Creating index '${indexName}'...`);

    try {
      await vectorStore.createIndex({
        indexName,
        dimension: 1536,
        metric: 'cosine',
      });
      console.log(`${colors.green}✓${colors.reset} Index created successfully\n`);
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        console.log(`${colors.yellow}ℹ${colors.reset} Index already exists, continuing...\n`);
      } else {
        throw error;
      }
    }

    // 2. Generate embeddings and insert documents
    console.log(
      `${colors.blue}→${colors.reset} Generating embeddings for ${sampleDocuments.length} documents...`,
    );

    const embeddings: number[][] = [];

    for (let i = 0; i < sampleDocuments.length; i++) {
      const doc = sampleDocuments[i];
      process.stdout.write(`\r  Processing document ${i + 1}/${sampleDocuments.length}...`);

      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: `${doc.title}\n${doc.content}`,
      });

      embeddings.push(embedding);

      // Small pause to avoid saturating the API
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`\n${colors.green}✓${colors.reset} Embeddings generated\n`);

    // 3. Insert into vector store
    console.log(`${colors.blue}→${colors.reset} Inserting documents into the index...`);

    const metadata = sampleDocuments.map((doc) => ({
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags,
      timestamp: new Date().toISOString(),
    }));

    await vectorStore.upsert({
      indexName,
      vectors: embeddings,
      metadata,
    });

    console.log(`${colors.green}✓${colors.reset} Documents inserted successfully\n`);

    // 4. Wait for indexing
    console.log(`${colors.blue}→${colors.reset} Waiting for indexing...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 5. Check stats
    const stats = await vectorStore.describeIndex({ indexName });

    console.log(`\n${colors.cyan}📊 Index Statistics:${colors.reset}`);
    console.log(`  Name: ${indexName}`);
    console.log(`  Documents: ${stats.count}`);
    console.log(`  Dimension: ${stats.dimension}`);
    console.log(`  Metric: ${stats.metric}`);

    // 6. Summary by categories
    const categoryCounts = sampleDocuments.reduce((acc, doc) => {
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`\n${colors.cyan}📂 Documents by Category:${colors.reset}`);
    Object.entries(categoryCounts).forEach(([category, count]) => {
      console.log(`  ${category}: ${count} documents`);
    });

    console.log(
      `\n${colors.green}✅ Knowledge base populated successfully!${colors.reset}\n`,
    );
    console.log(`${colors.cyan}💡 Next step:${colors.reset} Run the agent with:`);
    console.log(`  ${colors.blue}npm run demo:agent${colors.reset}\n`);
  } catch (error: any) {
    console.error(`\n${colors.yellow}❌ Error:${colors.reset}`, error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run
populateKnowledgeBase();
