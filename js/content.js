const ALLOWED_TAGS = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'H2', 'H3', 'H4', 'I', 'LI', 'OL', 'P', 'PRE', 'STRONG', 'U', 'UL']);
const REMOVE_TAGS = new Set(['BUTTON', 'EMBED', 'FORM', 'IFRAME', 'INPUT', 'MATH', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG']);

export function renderDescription(container, content, format = 'text') {
  container.replaceChildren();
  if (!content) return;

  if (format !== 'html') {
    const paragraph = document.createElement('p');
    paragraph.className = 'description-text';
    paragraph.textContent = content;
    container.append(paragraph);
    return;
  }

  const template = document.createElement('template');
  template.innerHTML = String(content);
  sanitizeTree(template.content);
  const wrapper = document.createElement('div');
  wrapper.className = 'description-html';
  wrapper.append(template.content.cloneNode(true));
  container.append(wrapper);
}

function sanitizeTree(root) {
  [...root.querySelectorAll('*')].forEach((element) => {
    if (REMOVE_TAGS.has(element.tagName)) {
      element.remove();
      return;
    }

    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    const rawHref = element.tagName === 'A' ? element.getAttribute('href') : '';
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
    if (element.tagName !== 'A') return;
    if (!rawHref) return;
    try {
      const url = new URL(rawHref, window.location.href);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;
      element.setAttribute('href', url.href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    } catch {
      element.removeAttribute('href');
    }
  });
}
