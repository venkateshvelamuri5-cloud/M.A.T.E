const fs = require('fs');
let content = fs.readFileSync('app/analyst/page.tsx', 'utf8');

content = content.replace('import { Upload', 'import UserManagementTab from \'./UserManagementTab\';\nimport { Upload');
content = content.replace('const [isLoggedIn, setIsLoggedIn] = useState(false);', 'const [isLoggedIn, setIsLoggedIn] = useState(false);\n  const [activeTab, setActiveTab] = useState<\'agents\' | \'users\'>(\'agents\');');

const tabHtml = '      {/* Tabs */}\n      <div className="max-w-6xl mx-auto flex gap-4 mb-6 relative z-10">\n        <button \n          onClick={() => setActiveTab(\'agents\')} \n          className={px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition }\n        >\n          Agent Setup\n        </button>\n        <button \n          onClick={() => setActiveTab(\'users\')} \n          className={px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition }\n        >\n          User Management\n        </button>\n      </div>\n\n      {activeTab === \'users\' ? (\n        <div className="max-w-6xl mx-auto relative z-10">\n          <UserManagementTab />\n        </div>\n      ) : (\n        <>';

content = content.replace('{/* Analytics Dashboard Grid */}', tabHtml + '\n      {/* Analytics Dashboard Grid */}');
content = content.replace('</div>\n    </div>\n  );\n}', '</div>\n        </>\n      )}\n    </div>\n  );\n}');

fs.writeFileSync('app/analyst/page.tsx', content);
