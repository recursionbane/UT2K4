// Install only the virtual-pad ownership boundary in the pinned SDL callbacks.
export function patchPadOwnership(source) {
  const guard='if(globalThis.__privateOwnsNativeTouch?.(e))return;';
  // Rebuild our guards so repeated composition with other input patches cannot
  // accumulate duplicates or mistake a guard in the other callback for this one.
  source=source.replaceAll(guard,'');
  for(const type of ['touch','mouse']) {
    const seam='var '+type+'EventHandlerFunc=e=>{';
    if(source.split(seam).length!==2)throw Error('Native '+type+' callback seam changed');
    source=source.replace(seam,seam+guard);
  }
  return source;
}
