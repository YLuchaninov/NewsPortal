export const APP_SHELL_STYLES = `
:root {
  color-scheme: light;
  --np-bg: #f3ede4;
  --np-surface: #fffaf3;
  --np-border: rgba(62, 32, 17, 0.14);
  --np-text: #2b1d13;
  --np-muted: #6c5648;
  --np-accent: #c45c2f;
  --np-accent-strong: #9f431d;
  --np-success: #2a7d45;
  --np-danger: #aa3a2a;
  --np-shadow: 0 20px 45px rgba(65, 38, 20, 0.1);
  font-family: "Georgia", "Times New Roman", serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--np-bg);
  color: var(--np-text);
}
a { color: inherit; }
main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 80px;
}
.np-shell {
  display: grid;
  gap: 20px;
}
.np-card {
  background: var(--np-surface);
  border: 1px solid var(--np-border);
  border-radius: 20px;
  padding: 20px;
  box-shadow: var(--np-shadow);
}
.np-grid {
  display: grid;
  gap: 20px;
}
.np-grid.two {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.np-heading {
  margin: 0 0 10px;
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 1;
}
.np-subtle {
  color: var(--np-muted);
}
.np-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--np-border);
  font-size: 0.85rem;
  margin-right: 8px;
  margin-bottom: 8px;
}
.np-table {
  width: 100%;
  border-collapse: collapse;
}
.np-table th,
.np-table td {
  border-bottom: 1px solid var(--np-border);
  padding: 10px 8px;
  text-align: left;
  vertical-align: top;
}
.np-button,
button,
input[type="submit"] {
  background: var(--np-accent);
  border: none;
  color: white;
  border-radius: 999px;
  padding: 10px 16px;
  cursor: pointer;
  font: inherit;
}
.np-button.secondary {
  background: transparent;
  border: 1px solid var(--np-border);
  color: var(--np-text);
}
input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--np-border);
  border-radius: 14px;
  padding: 10px 12px;
  font: inherit;
  background: #fff;
}
label {
  display: grid;
  gap: 6px;
  font-size: 0.95rem;
}
form {
  display: grid;
  gap: 12px;
}
`;

export function formatScore(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(2);
}
