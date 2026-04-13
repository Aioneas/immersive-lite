const specialRules = [
  {
    "hostname": [
      "twitter.com",
      "tweetdeck.twitter.com",
      "mobile.twitter.com"
    ],
    "selectors": [
      "[data-testid=\"tweetText\"]",
      ".tweet-text",
      ".js-quoted-tweet-text",
      "[data-testid='card.layoutSmall.detail'] > div:nth-child(2)",
      "[data-testid='developerBuiltCardContainer'] > div:nth-child(2)",
      "[data-testid='card.layoutLarge.detail'] > div:nth-child(2)",
    ],
    "detectLanguage":true

  },
  {
    "name":"ycombinator",
    "hostname": "news.ycombinator.com",
    "selectors": [
      ".titleline > a",
      ".comment",
      ".toptext",
      "a.hn-item-title",
      ".hn-comment-text",
      ".hn-story-title"
      
    ],
  },
  {
    "hostname": "www.reddit.com",
    "selectors": [
      "h1",
      "[data-click-id=body] h3",
      "[data-click-id=background] h3"
    ],
    "containerSelectors": [
      "[data-testid=comment]",
      "[data-adclicklocation=media]",
      ".Comment__body",
      "faceplate-batch .md"
    ],
    "detectLanguage":true
  },
  {
    "name":"oldRedditCompact",
    "regex":"old\.reddit\.com.*\/\.compact$",
    "selectors":[".title > a"],
    "containerSelectors":[".usertext-body"],
    "detectLanguage":true
  },
  {
    "name":"oldReddit",
    "hostname": "old.reddit.com",
    "selectors": [
      "p.title > a"
    ],
    "containerSelectors": [
      "[role=main] .md-container"
    ],
    "detectLanguage":true
  },
  {
    "regex": "finance.yahoo.com/$",
    "selectors": [
      "h3"
    ]
  },
  {
    "regex": [
      "www.bloomberg.com/[A-Za-z0-9]+$",
      "www.bloomberg.com/$"
    ],
    "selectors": [
      "article h3",
      "article .single-story-module__headline-link",
      "article [data-tracking-type=Story]",
      "article .story-list-story__info__headline"
    ]
  },
  {
    "regex": "translatewebpages.org/result/.+$",
    "selectors": [
      "div"
    ],
    "style": "none"
  },
  {
    "hostname": "www.cell.com",
    "selectors": [
      "div.section-paragraph > div.section-paragraph > div.section-paragraph",
      "section > div.section-paragraph",
      "h4",
      "h3",
      "h2"
    ]
  },
  {
    "hostname": [
      "www.msdmanuals.com",
    ],
    "noTranslateSelectors": [
      ".d-none"
    ]
  },
  {
    "hostname": "www.reuters.com",
    "containerSelectors": "main"
  },
  {
    "regex": "finance.yahoo.com/news",
    "containerSelectors": "[role=article]"
  },
  {
    "hostname": "www.whatsonweibo.com",
    "containerSelectors": "#mvp-post-main"
  },
  {
    "hostname": [
      "www.wsj.com",
      "www.economist.com"
    ],
    "containerSelectors": "main"
  },
  {
    "hostname": [
      "mail.jabber.org",
      "antirez.com"
    ],
    "selectors": [
      "pre"
    ],
    "containerSelectors": "pre",
    "style": "none"
  },
  {
    "hostname": "github.com",
    "selectors":[".markdown-title"],
    "containerSelectors": ".markdown-body",
    "detectLanguage":true
  },
  {
    "hostname": "www.youtube.com",
    "selectors": [
      "#content-text"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "www.facebook.com",
    "selectors": [
      "div[data-ad-comet-preview=message] > div > div",
      "div[role=article] > div > div > div > div > div > div > div > div "
    ],
    "detectLanguage":true
  },
  {
    "regex": "\.substack\.com\/",
    "selectors": [
      ".post-preview-title",
      ".post-preview-description",
      
    ],
    "containerSelectors": [
      ".post",
      ".comment-body"
    ]
  },
  {
    "hostname": "www.nature.com",
    "containerSelectors": "article"
  },
  {
    "name":"seekingalpha",
    "hostname": "seekingalpha.com",
    "selectors":["[data-test-id='post-list-item'] h3"],
    "containerSelectors": ["div.wsb_section","[data-test-id=card-container]"],
    "brToParagraph": true
  },
  {
    "hostname": "hn.algolia.com",
    "selectors": [
      ".Story_title"
    ]
  },
  {
    "hostname": "read.readwise.io",
    "selectors": [
      "div[class^=\"_titleRow_\"]",
      "div[class^=\"_description_\"]"
    ],
    "containerSelectors": [
      "#document-text-content"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "www.inoreader.com",
    "selectors": [
      ".article_title"
    ],
    "containerSelectors": [
      ".article_content"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "mail.google.com",
    "selectors": [
      "h2[data-thread-perm-id]",
      "span[data-thread-id]"
    ],
    "containerSelectors": [
      "div[data-message-id]"
    ],
    "blockElements": [
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "OL",
      "P",
      "LI"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "www.producthunt.com",
    "selectors": [
      "h2",
      "div.layoutCompact div[class^='styles_htmlText__']",
      ".fontWeight-400.fontSize-desktop-16.color-lighter-grey",
      "a[href^='/discussions/'].fontWeight-600",
      "div.color-darker-grey.fontSize-14.fontWeight-400.noOfLines-undefined",
      "div.color-darker-grey.fontSize-16.fontWeight-400.noOfLines-undefined"
    ],
    "containerSelectors": [
      "div[class^='styles_htmlText__']"
    ]
  },
  {
    "hostname": "arxiv.org",
    "selectors": [
      "blockquote.abstract",
      "h1"
    ]
  },
  {
    "name":"discord",
    "hostname": "discord.com",
    "selectors": [
      "div[id^='message-content-']",
      "div[class^='header-']",
    ],
    "detectLanguage":true
  },
  {
    "regex": "web.telegram.org/z/",
    "selectors": [
      ".text-content"
    ],
    "detectLanguage":true
  },
  {
    "hostname":"gist.github.com",
    "containerSelectors":[
      ".markdown-body",".readme"
    ],
  
    "detectLanguage":true
  },
  {
    "hostname": "www.politico.com",
    "containerSelectors": "main"
  },
  {

    "hostname":"lobste.rs",
    "selectors":[".u-repost-of"],
    "containerSelectors":[".comment_text"]
  },
  {
    "regex":"\.slack\.com\/",
    "selectors":[".p-rich_text_section"],
    "detectLanguage":true
  },
  {
    "hostname":"1paragraph.app",
    "selectors":["[xmlns='http://www.w3.org/1999/xhtml']"]
  },{
    "hostname":"www.nytimes.com",
    "selectors":["h1"],
    "containerSelectors":"[name=articleBody]"
  },
  {
    "hostname":"reader.960960.xyz",
    "selectors":["body > *"],
    "iframeContainer": "iframe"
  },{
    "name":"stackoverflow",
    "hostname":["stackoverflow.com","superuser.com","askubuntu.com","serverfault.com"],
    "regex":"stackexchange\.com",
    "selectors":[".s-post-summary--content-title","h1 > a",".comment-copy"],
    "containerSelectors":"[itemprop=text]"
  },{
    "hostname":"app.daily.dev",
    "selectors":["h1",".typo-body","article h3"],
    "containerSelectors":"[class^=markdown_markdown]"
  },{
    "name":"google",
    "regex":"^https:\/\/www\.google\.",
    "selectors":["h2","a h3","div[data-content-feature='1'] > div","a [aria-level='3']","a [aria-level='3'] + div",".Uroaid"],
    "detectLanguage":true

  },{
    "hostname":"www.urbandictionary.com",
    "selectors":["div.meaning","div.example"],
  },{
    "hostname":"answers.microsoft.com",
    "selectors":["h1","div.thread-message-content div.thread-message-content-body-text"],
    "containerSelectors":["div.thread-message-content-body-text",]
  },
  {
    "hostname":"www.getrevue.co",
    "selectors":[".item-header",".revue-p",".introduction-subject",".revue-ul > li",".header-text"]
  },
  {
    "regex":"www\.pixelmator\.com\/community\/",
    "selectors":[".content",".topic-title",".topictitle"]
  },
  {
    "hostname":"kyivindependent.com",
    "selectors":["[class^=CardFeaturedBlock_cardFeaturedBlock__title]","[class^=CardBasic_cardBasic__title]","[class^=CardExclusive_cardExclusive__title]","[class^=card-horizontal-small_cardHorizontalSmall__title]"],
    "containerSelectors":"article"
  },
  {
    "hostname":"lowendtalk.com",
    "selectors":["[role=heading]","h1"],
    "containerSelectors":".userContent"
  },
  {
    "hostname":"zlibrary24tuxziyiyfr7zd46ytefdqbqd2axkmxm4o5374ptpc52fad.onion",
    "selectors":[".blogText",".jscommentsCommentText"]
  },
  {
    "hostname":"www.sciencedirect.com",
    "selectors":["h1"],
    "containerSelectors":"article"
  },
  {
    "hostname":"www.linkedin.com",
    "selectors":[
      ".feed-shared-update-v2__description-wrapper",
    ],
    "containerSelectors":[
      "article.jobs-description__container"
    ]
  },{
    "hostname":"www.indiehackers.com",
    "containerSelectors":[
      ".content",
    ],
    "selectors":["h1",".feed-item__title-link"]
  },{
    "hostname":"libreddit.de",
    "selectors":[
      "h2.post_title"
    ],
    "containerSelectors":[
      ".comment_body > .md"
    ]
  },{
    "hostname":"www.notion.so",
    "regex":"notion\.site",
    "selectors":[
      "div[data-block-id]"
    ]
  },{
    "hostname":"www.newyorker.com",
    "selectors":["h1","[data-testid=SummaryItemHed]"],
    "containerSelectors":["[data-testid=BodyWrapper]"]
  },{
    "hostname":"start.me",
    "selectors":[".rss-article__title",".rss-articles-list__article-link",".rss-showcase__title",".rss-showcase__text"]
  },{
    "regex":"developer\.apple\.com\/documentation",
    "selectors":[".contenttable .content","h3.title"]
  }
]
