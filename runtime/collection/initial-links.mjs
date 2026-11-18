// Stop the HTML preload scanner from racing the authenticated startup download.
export function deferInitialLinks(html, selection) {
  return html.replace(/<link\b[^>]*>/gi, tag =>
    tag.replace(/\bhref=(["'])(.*?)\1/i, (attribute, quote, href) => {
      if (!href.startsWith('./')) return attribute;
      selection.set(href.slice(2), [null]);
      return 'data-initial-href=' + quote + href + quote;
    })
  );
}

// Serialized into the startup script. Styles and icons come from verified bytes.
export async function restoreInitialLinks(api, base) {
  const blobs = new Map();
  function assetURL(url) {
    if (!blobs.has(url)) {
      const response = api.lookup(url);
      blobs.set(url, response ? response.blob().then(blob => URL.createObjectURL(blob)) : Promise.resolve(url));
    }
    return blobs.get(url);
  }
  for (const link of document.querySelectorAll('link[data-initial-href]')) {
    const url = new URL(link.dataset.initialHref, base).href;
    const res = api.lookup(url);
    if (!res) throw Error('Missing startup link ' + link.dataset.initialHref);
    if (link.rel === 'stylesheet') {
      let css = await res.text();
      const refs = [...css.matchAll(/url\(\s*(["']?)([^)'"]+?)\1\s*\)/gi)];
      for (const [original,, ref] of refs) {
        if (/^(data:|#)/i.test(ref)) continue;
        css = css.replace(original, 'url("' + await assetURL(new URL(ref, url).href) + '")');
      }
      const style = document.createElement('style');
      style.media = link.media;
      style.textContent = css;
      link.replaceWith(style);
    } else if (link.rel === 'manifest') {
      const manifest = await res.json();
      for (const prop of ['start_url', 'scope', 'id']) {
        if (manifest[prop]) manifest[prop] = new URL(manifest[prop], url).href;
      }
      for (const item of [...(manifest.icons || []), ...(manifest.screenshots || [])]) {
        if (item.src) item.src = await assetURL(new URL(item.src, url).href);
      }
      link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], {type:'application/manifest+json'}));
    } else {
      link.href = await assetURL(url);
    }
  }
}
