const fs = require('fs');
let content = fs.readFileSync('app/analyst/page.tsx', 'utf8');

// 1. Add State
content = content.replace('const [editInstructions, setEditInstructions] = useState(\\'\\');', 'const [editInstructions, setEditInstructions] = useState(\\'\\');\n  const [editCustomQuestions, setEditCustomQuestions] = useState<string[]>([]);');

// 2. Initialize existing
content = content.replace('setEditInstructions(existing.instructions || \\'\\');', 'setEditInstructions(existing.instructions || \\'\\');\n        setEditCustomQuestions(existing.custom_questions || []);');

// 3. Initialize empty
content = content.replace('setEditInstructions(template?.emailExample || \\'\\');', 'setEditInstructions(template?.emailExample || \\'\\');\n        setEditCustomQuestions([]);');

// 4. Update Payload
content = content.replace('instructions: editInstructions,\\n            keywords: editKeywords,', 'instructions: editInstructions,\n            custom_questions: editCustomQuestions,\n            keywords: editKeywords,');

fs.writeFileSync('app/analyst/page.tsx', content);
