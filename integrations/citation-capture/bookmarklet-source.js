/*
 * NightOwl citation capture bookmarklet.
 *
 * Usage:
 * 1) Copy the single-line "bookmarklet" string below.
 * 2) Create a browser bookmark.
 * 3) Paste the string as the bookmark URL.
 */

const bookmarklet = "javascript:(()=>{try{const selected=(window.getSelection?window.getSelection().toString():'').trim();const bodyText=((document.body&&document.body.innerText)||'');const bibMatch=bodyText.match(/@[A-Za-z]+\\s*[{(][\\s\\S]{0,15000}[})]/);const citationText=(bibMatch?bibMatch[0]:(selected||document.title||location.href)).trim();const query=new URLSearchParams({text:citationText,title:document.title||'',url:location.href,source:'bookmarklet'});(new Image()).src='http://127.0.0.1:27124/capture?'+query.toString();}catch(error){console.error('NightOwl capture failed',error);}})();";

console.log(bookmarklet);
