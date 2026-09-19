const fs = require('fs');
let content = fs.readFileSync('app/login/page.tsx', 'utf8');

// Remove unused state
content = content.replace(/const \[emailInput, setEmailInput\] = useState\(''\);\r?\n/, '');
content = content.replace(/const \[passwordInput, setPasswordInput\] = useState\(''\);\r?\n/, '');

// Remove handleLogin
content = content.replace(/const handleLogin = async \(e.*?\) => \{[\s\S]*?\};\r?\n/, '');

// Remove unused imports (Mail, Lock, LogIn)
content = content.replace(/import \{ ArrowLeft, Mail, Lock, LogIn \} from 'lucide-react';/, "import { ArrowLeft } from 'lucide-react';");

fs.writeFileSync('app/login/page.tsx', content);
