/* Theme toggle for the sub-pages (the choice is shared with the main page). */
document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.addEventListener('click',()=>{
  const h=document.documentElement,n=h.dataset.theme==='dark'?'light':'dark';h.dataset.theme=n;
  try{localStorage.setItem('pf-theme',n)}catch(e){}
}));
