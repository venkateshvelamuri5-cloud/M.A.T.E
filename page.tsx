@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #fcfcfd;
  --foreground: #0f172a;
}

body {
  color: var(--foreground);
  background-color: var(--background);
  font-family: 'Outfit', sans-serif;
  overflow-x: hidden;
}

/* Elegant minimalist border & box classes */
.card-clean {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
}

.card-clean-accent {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
}
