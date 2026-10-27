// (#326) The languages' flags, drawn (an emoji flag shows as two letters on some devices): en the Union Jack, ru white-blue-red,
// uk blue and yellow. flagHtml(code) is a small inline picture, 3:2

const FLAGS = {
  en: '<rect width="24" height="16" fill="#1f3a8a"/><path d="M0 0L24 16M24 0L0 16" stroke="#fff" stroke-width="3"/><path d="M0 0L24 16M24 0L0 16" stroke="#c8102e" stroke-width="1.2"/><path d="M12 0V16M0 8H24" stroke="#fff" stroke-width="5"/><path d="M12 0V16M0 8H24" stroke="#c8102e" stroke-width="3"/>',
  ru: '<rect width="24" height="16" fill="#fff"/><rect y="5.33" width="24" height="5.34" fill="#1c57a5"/><rect y="10.67" width="24" height="5.33" fill="#d52b1e"/>',
  uk: '<rect width="24" height="8" fill="#0057b7"/><rect y="8" width="24" height="8" fill="#ffd700"/>'
};

/** @param {string} code a language's code */
export function flagHtml(code) {
  return `<svg class="flag" viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">${FLAGS[code] || '<rect width="24" height="16" fill="#555"/>'}<rect x="0.5" y="0.5" width="23" height="15" fill="none" stroke="rgba(0,0,0,0.45)"/></svg>`;
}
