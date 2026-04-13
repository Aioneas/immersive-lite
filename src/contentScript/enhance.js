const enhanceMarkAttributeName = "data-translationmark";

const enhanceOriginalDisplayValueAttributeName = "data-translationoriginaldisplay";
const enhanceHtmlTagsInlineIgnore = ['BR', 'CODE', 'KBD', 'WBR'] // and input if type is submit or button, and pre depending on settings
const enhanceHtmlTagsNoTranslate = ['TITLE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'svg'] //TODO verificar porque 'svg' é com letras minúsculas
let blockElements = [
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6','TABLE',  'OL', 'P','LI'
  ];
if (twpConfig.get('translateTag_pre') !== 'yes') {
    blockElements.push('PRE')
}

const headingElements = ['h1' ];

const pdfSelectorsConfig =   {
    regex:
      "translatewebpages.org/result/.+$"
};

const inlineElements = [
  "a",
  "abbr",
  "acronym",
  "b",
  "bdo",
  "big",
  "br",
  "button",
  "cite",
  "code",
  "dfn",
  "em",
  "i",
  "img",
  "input",
  "kbd",
  "label",
  "map",
  "object",
  "output",
  "q",
  "samp",
  "script",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "textarea",
  "time",
  "tt",
  "var",
];


function addWrapperToNode(node, wrapper){
  try{

    const parent = node.parentNode;
        // set the wrapper as child (instead of the element)
    parent.replaceChild(wrapper, node);
        // set element as child of wrapper
    wrapper.appendChild(node);

  }catch(e){
    console.error('add wrapper error',e);
  }
}

function getPageSpecialConfig(ctx){
  const currentUrl = ctx.tabUrl;
  const currentUrlObj = new URL(currentUrl);
  const currentHostname = currentUrlObj.hostname;
  const currentUrlWithoutSearch = currentUrlObj.origin + currentUrlObj.pathname;

  // merge spcialRules

  let specialConfig = null;

  for(const enhance of specialRules){
    if(enhance.hostname){
      if(!Array.isArray(enhance.hostname)){
        enhance.hostname = [enhance.hostname];
      }
      if(enhance.hostname.indexOf(currentHostname) !== -1){
        return enhance;
      }
    }
    if(enhance.regex){
      if(!Array.isArray(enhance.regex)){
        enhance.regex = [enhance.regex];
      }
      let isMatched = false;
      for(const regex of enhance.regex){
        const reg = new RegExp(regex);
        if(reg.test(currentUrlWithoutSearch)){
            return enhance;
        }
      }
    }
  }


  // handle nitter, there are too many domains, so we detect it by meta, and element
  // if og:sitename is "Nitter", and there is class name tweet-content, then it is nitter
  const nitterMeta = document.querySelector('meta[property="og:site_name"]');
  if(nitterMeta && nitterMeta.getAttribute('content') === 'Nitter'){
    const nitterTweetContent = document.querySelector('.tweet-content');
    if(nitterTweetContent){
      specialConfig =  {
        name:"nitter",
        selectors:['.tweet-content','.quote-text']
      }
    }
  }


  // handle mastondon
  const mastodonId = document.querySelector('div#mastodon');
  const mastonText = document.querySelector('div.status__content__text');
  if(mastodonId){
    specialConfig =  {
      name:"mastodon",
      containerSelectors:'div.status__content__text',
      detectLanguage:true
    }
  }
  return specialConfig
}



function isValidNode(node){
  if(node.hasAttribute && node.hasAttribute(enhanceMarkAttributeName)){
    return false;
  }
  if(enhanceHtmlTagsInlineIgnore.indexOf(node.nodeName) !== -1 ||
  enhanceHtmlTagsNoTranslate.indexOf(node.nodeName) !== -1 ||
  node.classList.contains("notranslate") ||
  node.getAttribute("translate") === "no" ||
  node.isContentEditable) {
    return false
  }
  
  // check is parent has enhanceMarkAttributeName
  if(node.parentNode && node.parentNode.hasAttribute && node.parentNode.hasAttribute(enhanceMarkAttributeName)){
    return false;
  }
  // check ancestors
  if(node.closest && node.closest(`[${enhanceMarkAttributeName}=copiedNode]`)){
    return false;
  }
  // check is img node
  if(node.nodeName==="P"){
    // check all children nodes

    const children = node.childNodes;
    let isIncludeImg = node.querySelector('img');
    if(isIncludeImg && node.childNodes.length<3){
      // treat it as img node
      // check length
      const innerText = node.innerText;
      if(innerText.length<80){
        return false;
      }else{
        return true;
      }
    }
      

  }

  // check is there is notranslate class
  return true;
}
function showCopyiedNodes(){
  const copiedNodes = document.querySelectorAll(`[${enhanceMarkAttributeName}="copiedNode"]`);
  for(const node of copiedNodes){
    // @ts-ignore: its ok
    if(node && node.style && node.style.display === "none"){
       // delete display
      const originalDisplay = node.getAttribute(enhanceOriginalDisplayValueAttributeName);
      if(originalDisplay){
        // @ts-ignore: its ok
        node.style.display = originalDisplay;
      } else {
        // delete display
        // @ts-ignore: its ok
        node.style.removeProperty("display");
      }
    }
  }

}
function removeCopyiedNodes(){
  const copiedNodes = document.querySelectorAll(`[${enhanceMarkAttributeName}="copiedNode"]`);
  for(const node of copiedNodes){
    node.remove()
  }
}


function isBody(el) {
  return document.body === el;
}
function isDuplicatedChild(array,child){
  for(const item of array){
    if(item.contains(child)){
      return true;
    }
  }
  return false;
}
async function getNodesThatNeedToTranslate(root,ctx,options){
  options = options || {};
  const pageSpecialConfig = getPageSpecialConfig(ctx);
  const twpConfig = ctx.twpConfig
  const neverTranslateLangs = twpConfig.get('neverTranslateLangs');
  const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
  const allBlocksSelectors = pageSpecialConfig && pageSpecialConfig.selectors || []
  const noTranslateSelectors = pageSpecialConfig && pageSpecialConfig.noTranslateSelectors || []
  if(noTranslateSelectors.length > 0){
    const noTranslateNodes = root.querySelectorAll(noTranslateSelectors.join(","));
    for(const node of noTranslateNodes){
      // add class notranslate
      // node.classList.add("notranslate");
      // add parent placeholder for position
      const placeholder = document.createElement("span");
      placeholder.classList.add("notranslate");
      addWrapperToNode(node,placeholder);
    }
  }


  // all block nodes, nodes should have a order from top to bottom
  let allNodes = [];

  const currentUrl = ctx.tabUrl;
  const currentUrlObj = new URL(currentUrl);
  const currentUrlWithoutSearch = currentUrlObj.origin + currentUrlObj.pathname;
  const currentHostname = currentUrlObj.hostname;
  let currentTargetLanguage = twpConfig.get("targetLanguage")

  // special for mail.google.com, cause there are too many table, we should remove table
  if(pageSpecialConfig && pageSpecialConfig.blockElements){
    blockElements = pageSpecialConfig.blockElements;
  }
  let isIframeContainer = false;
  // check sites
  if(allBlocksSelectors.length>0){
    // check id iframe
    if(pageSpecialConfig && pageSpecialConfig.iframeContainer){
      const iframeContainer = root.querySelector(pageSpecialConfig.iframeContainer);
      if(iframeContainer){
        root = iframeContainer.contentDocument;
        isIframeContainer = true;
      }
    }
    for(const selector of allBlocksSelectors){

      if(root && root.querySelectorAll){
        const nodes = root.querySelectorAll(selector);
        for(const node of nodes){
          if(currentHostname==="twitter.com" || currentHostname==="twitterdesk.twitter.com" || currentHostname==="mobile.twitter.com"){
            // check language
            try{
              const lang = node.getAttribute("lang");
              if(lang && checkIsSameLanguage(lang,[currentTargetLanguage,...neverTranslateLangs],ctx)){
                continue;
              }
            }catch(e){
              // ignore
              // console.log("e", e)
            }
          }

          if(isValidNode(node) && !isDuplicatedChild(allNodes,node)){
            allNodes.push(node);
          }
        }
      }
    }
  }


  if(!isIframeContainer && ((pageSpecialConfig && pageSpecialConfig.containerSelectors) || allBlocksSelectors.length === 0)){
    
    const originalRoot = root;
    const contentContainers = getContainers(root,pageSpecialConfig);
    let containers = []
    if(pageSpecialConfig && pageSpecialConfig.containerSelectors){
      if(!Array.isArray(pageSpecialConfig.containerSelectors)){
        pageSpecialConfig.containerSelectors = [pageSpecialConfig.containerSelectors];
      }
      // check length
      if(pageSpecialConfig.containerSelectors.length ===0){
        containers = [root]
      }
    }
    if(contentContainers && Array.isArray(contentContainers)){
      containers = contentContainers;
    }  
    for(const root of containers){
      for(const blockTag of blockElements){
        const paragraphs = root.querySelectorAll(blockTag.toLowerCase());
        for (const paragraph of paragraphs) {
          if(isValidNode(paragraph) && !isDuplicatedChild(allNodes,paragraph)){
            allNodes.push(paragraph);
          }
        }
      }
      if(!pageSpecialConfig || !pageSpecialConfig.containerSelectors){
       // add addition heading nodes
        for(const headingTag of headingElements){
          const headings = originalRoot.querySelectorAll(headingTag.toLowerCase());
          for (const heading of headings) {
            if(isValidNode(heading)){
              // check if there is already exist in allNodes
              let isExist = false;
              for(const node of allNodes){
                if(node === heading){
                  isExist = true;
                  break;
                }
              }
              if(!isExist){
               allNodes.push(heading);
              }
            }
          }
        }
      }
    }
  }


  // sort allNodes, from top to bottom
  allNodes.sort(function(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  })



  // check node language is target language, if yes, remove it

  let newAllNodes = [];

  if((pageSpecialConfig && pageSpecialConfig.detectLanguage===true)){
    // only check when detectLanguage is not false
    if(allNodes.length<500){
      for(const node of allNodes){
        const nodeText = node.innerText;
        if(nodeText && nodeText.trim().length>0){
            const lang = await detectLanguage(nodeText);
            if(lang && !checkIsSameLanguage(lang,[currentTargetLanguage,...neverTranslateLangs],ctx)){
              // only translate the clearly language
              newAllNodes.push(node);
            }

        }
      }
      allNodes = newAllNodes;
    }
  }



  if(!isShowDualLanguage){
      return allNodes;
  }

  // is pdf, if pdf, then treat it as a special case
  const isPdf = new RegExp(pdfSelectorsConfig.regex).test(currentUrlWithoutSearch);
  if(isPdf){
    // add flex container to div
    for(const node of allNodes){
      const parent = node.parentNode;
      const pdfContainer = document.createElement("div");
      pdfContainer.style.display = "flex";
      addWrapperToNode(node,pdfContainer);
    }
  }

  for(const node of allNodes){
    // check if there is a copy already
    const previousSibling = node.previousSibling;
    // console.log("previousSibling.hasAttribute(markAttributeName)", previousSibling.hasAttribute(markAttributeName))
    if(!previousSibling || !previousSibling.hasAttribute || !previousSibling.hasAttribute(enhanceMarkAttributeName)){
      // add 
      let copyNode = node.cloneNode(true);
      // get original display value
      let originalDisplay = node.style.display;
      if(ctx.tabHostName==="www.reddit.com"){
        // append child <br>
        if(copyNode.nodeName.toLowerCase() === "h3" || copyNode.nodeName.toLowerCase() === "h1"){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && (pageSpecialConfig.name==='oldRedditCompact' || pageSpecialConfig.name==='oldReddit')){

        // if class name includes title
        if(node.parentNode && node.parentNode.className.includes("title")){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='stackoverflow'){
        // if parrent name is h1
        if((node.parentNode && node.parentNode.nodeName.toLowerCase() === "h1") || (node.classList.contains("comment-copy"))){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='ycombinator'){
        if(node.nodeName.toLowerCase() === "a" ){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='google'){
        if(node.nodeName.toLowerCase() === "h3" ){
            // check copy node display to block
            originalDisplay = "block";
        }
      
      }else if(pageSpecialConfig && pageSpecialConfig.name==='discord'){
        if(node.nodeName.toLowerCase() === "h3" ){
          // check copy node display to block
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }

      }else if(pageSpecialConfig && pageSpecialConfig.selectors){
        // check is inline element
        if(inlineElements.includes(node.nodeName.toLowerCase())){
          // originalDisplay = "block";
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }

      }
      

      if(inlineElements.includes(copyNode.nodeName.toLowerCase())){
        // add a space
        copyNode.style.paddingRight = "8px";
      }else{
        // if not li element
        const copiedNodeName = copyNode.nodeName.toLowerCase();
        if(!['p','ul','ol','li'].includes(copiedNodeName)){
          copyNode.style.paddingBottom = "8px";
        }
      }
      // if nitter
      if(pageSpecialConfig && pageSpecialConfig.name && pageSpecialConfig.name === "nitter"){
        // display to block
        originalDisplay = "block";
      }
      formatCopiedNode(copyNode,originalDisplay,ctx,pageSpecialConfig);
      if(ctx.tabHostName === "www.youtube.com"){
        // special, we need to insert all children of the copied node to node
        const copiedChildren = copyNode.childNodes;
        const firstNode = node.childNodes[0];
        for(let copiedChild of copiedChildren){
          // if copiedChildNode is a text node, add span wrapper
          if(copiedChild.nodeType === Node.TEXT_NODE){
            const span = document.createElement("span");
            span.appendChild(copiedChild);
            copiedChild = span;
          }
          formatCopiedNode(copiedChild,undefined,ctx,pageSpecialConfig);
          node.insertBefore(copiedChild,firstNode);
        }
        // new line span node
        const newLineSpan = document.createElement("span");
        newLineSpan.innerHTML = "\n";
        formatCopiedNode(newLineSpan,undefined,ctx,pageSpecialConfig);
        node.insertBefore(newLineSpan,firstNode);
      }else{
        node.parentNode.insertBefore(copyNode, node)
      }
    }
  }
  // copy 
  return allNodes;
}

// get the main container, copy from: https://github.com/ZachSaucier/Just-Read/blob/master/content_script.js

function getContainers(root,pageSpecialConfig){ 
    if(pageSpecialConfig && pageSpecialConfig.containerSelectors){
      // is array
      if(!Array.isArray(pageSpecialConfig.containerSelectors)){
        pageSpecialConfig.containerSelectors = [pageSpecialConfig.containerSelectors];
      }

      if(pageSpecialConfig.containerSelectors.length >0){
        let containers =[];
        for(const selector of pageSpecialConfig.containerSelectors){
            if(root && root.querySelectorAll){
              const allContainer = root.querySelectorAll(pageSpecialConfig.containerSelectors);
              if(allContainer){
                for(const container of allContainer){
                  // check if brToParagraph
                  if(pageSpecialConfig.brToParagraph){
                      const pattern = new RegExp ("<br/?>[ \r\n\s]*<br/?>", "g");
                      container.innerHTML = container.innerHTML.replace(pattern, "</p><p>");
                  }


                  containers.push(container);
                } 
              }
            }
        }
        return containers.length>0?containers:null;
      }
    }

    if(!(root && root.innerText)){
      return null
    }
    // role=main
    // const main = root.querySelector("[role=main]");
    // if(main){
    //   return main;
    // }
    let selectedContainer;
    const matched =  root.innerText.match(/\S+/g);
    const numWordsOnPage =matched?matched.length:0;
    let ps = root.querySelectorAll("p");

    // Find the paragraphs with the most words in it
    let pWithMostWords = root,
        highestWordCount = 0;

    if(ps.length === 0) {
        ps = root.querySelectorAll("div");
    }

    ps.forEach(p => {
        if(checkAgainstBlacklist(p, 3) // Make sure it's not in our blacklist
        && p.offsetHeight !== 0) { //  Make sure it's visible on the regular page
            const myInnerText = p.innerText.match(/\S+/g);
            if(myInnerText) {
                const wordCount = myInnerText.length;
                if(wordCount > highestWordCount) {
                    highestWordCount = wordCount;
                    pWithMostWords = p;
                }
            }
        }

    });

    // Keep selecting more generally until over 2/5th of the words on the page have been selected
    selectedContainer = pWithMostWords;
    let wordCountSelected = highestWordCount;

    while(wordCountSelected / numWordsOnPage < 0.4
    && selectedContainer != root
    && selectedContainer.parentElement && selectedContainer.parentElement.innerText) {
        selectedContainer = selectedContainer.parentElement;
        wordCountSelected = selectedContainer.innerText.match(/\S+/g).length;
    }

    // Make sure a single p tag is not selected
    if(selectedContainer.tagName === "P") {
        selectedContainer = selectedContainer.parentElement;
    }

    return [selectedContainer];
}

// Check given item against blacklist, return null if in blacklist
const blacklist = ["comment"];
function checkAgainstBlacklist(elem, level) {
    if(elem && elem != null) {
        const className = elem.className,
              id = elem.id;

        const isBlackListed = blacklist.map(item => {
            if((typeof className === "string" && className.indexOf(item) >= 0)
            || (typeof id === "string" && id.indexOf(item) >= 0)
            ) {
                return true;
            }
        }).filter(item => item)[0];

        if(isBlackListed) {
            return null;
        }

        const parent = elem.parentElement;
        if(level > 0 && parent && !parent.isSameNode(document.body)) {
            return checkAgainstBlacklist(parent, --level);
        }
    }

    return elem;
}
function getStyle(el) {
  return window.getComputedStyle(el)
}

function formatCopiedNode(copyNode,originalDisplay,ctx,pageSpecialConfig){
      copyNode.setAttribute(enhanceMarkAttributeName, "copiedNode");
      // add data-translationoriginaldisplay
      if(originalDisplay){
        copyNode.setAttribute(enhanceOriginalDisplayValueAttributeName, originalDisplay);
      }
      // add display none
      copyNode.style.display = "none";
      // add notranslate class
      copyNode.classList.add("notranslate");
      const twpConfig = ctx.twpConfig;
      const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
      if (isShowDualLanguage && (!pageSpecialConfig || pageSpecialConfig.style!=="none")) {
        let customDualStyle = twpConfig.get("customDualStyle");
        let dualStyle = customDualStyle || twpConfig.get("dualStyle") || 'underline';
        if(pageSpecialConfig && pageSpecialConfig.style){
          dualStyle = pageSpecialConfig.style;
        }
        if (dualStyle === 'mask') {
          copyNode.classList.add("immersive-translate-mask-next-sibling");
        }
      }
}

function addStyle(){
  try{

  // important style
  var css = '.immersive-translate-mask-next-sibling + *{filter:blur(5px);transition: filter 0.1s ease; } .immersive-translate-mask-next-sibling + *:hover {filter:none !important;}';
  var style = document.createElement('style');
  if (style.styleSheet) {
      style.styleSheet.cssText = css;
  } else {
      style.appendChild(document.createTextNode(css));
  }
  document.getElementsByTagName('head')[0].appendChild(style);
  }catch(e){
    // ignore
  }
}

addStyle()


 function detectLanguage(text) {
  // send message to background
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "detectLanguage",
             text: text
        }, response => {
            resolve(response)
        })
    })
}


function checkIsSameLanguage(lang,langs,ctx){
  const finalLang = twpLang.fixTLanguageCode(lang);
  if(!finalLang){
    return false;
  }
  if(langs.includes(finalLang)){
    return true;
  }
  
  // for api does not has the best detect for zh-CN and zh-TW
  // we will treat zh-CN and zh-TW as same language
  // we focus on the dual language display, so zh-TW -> zh-CN is not the first priority to fix,
  // I think people will not use it to learn zh-TW to zh-CN
  // only is show dual language, we will treat zh-CN and zh-TW as same language
  if(ctx && ctx.twpConfig && ctx.twpConfig.get("isShowDualLanguage")==='yes'){
    if(finalLang.startsWith("zh-")){
      // if langs , includes any lang starts with zh- , we will treat it as same language
      return langs.filter(lang=>lang.startsWith("zh-")).length>0;
    }else{
      return false
    }
  }

  return false
}
