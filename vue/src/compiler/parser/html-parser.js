/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// 除了\s"'<>\/=外的任意字符都可以是key
// =
// 如果是双引号开头的，中间内容就是除了双引号的任何内容，单引号开头的，中间内容就是除了单引号的任何内容
// 或者不写引号，直接是除了\s"'=<>`的值也行

//<ul :class="bindCls" class="list" v-if="isShow"><li v-for="(item,index) in data" @click="clickItem(index)">{{item}}:{{index}}</li></ul>

// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0 // 当前索引
  let last, lastTag // last是保留上次的html文本，lastTag是保留上次解析的标签
  while (html) { // 循环html，直到对html处理完毕
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 如果lastTag不存在，或者不在style script，textarea中
      let textEnd = html.indexOf('<')
      if (textEnd === 0) { // 如果尖括号的位置是0
        // Comment:
        if (comment.test(html)) { // 是不是匹配到注释节点
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) { // 是否匹配到了注释节点的结尾
            if (options.shouldKeepComment) { // options中是否传了保留注释节点
              options.comment(html.substring(4, commentEnd)) // 如果保留注释节点，就调用options.comment
              // <!-- abcd --> html.substring(4, commentEnd)就是abcd
            }
            advance(commentEnd + 3) // 从-->后截断
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          // <![if !IE]>
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) { // 如果有的话直接前进到结尾，并且什么都不做
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) { // 是不是doctype节点,如果是就直接前进到他的长度
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) { // 是不是匹配到结束标签节点
          const curIndex = index
          advance(endTagMatch[0].length) // 匹配到就前进这个长度
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) { // 是不是匹配到开始标签节点，匹配到就会返回match对象
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }
      // <ul :class="bindCls" class="list" v-if="isShow"><li v-for="(item,index) in data" @click="clickItem(index)">{{item}}:{{index}}</li></ul>
      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd) // 切割到 < 的位置
        while ( // 是结束标签，就跳过
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest) // 如果文本中也有<，就会产生 rest不是开始结束注释和condition注释
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1) // 去找下一个 < 直到满足条件为止
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd) // 用text截取文本，然后跳到 < 的地方
        advance(textEnd)
      }

      if (textEnd < 0) { // 如果没有尖括号，就把剩余的html全部给text
        text = html
        html = ''
      }

      if (options.chars && text) { // 处理完文本后，调用options.chars，创建文本ast
        options.chars(text)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  function advance (n) { // 设置当前位置，并截断html
    index += n
    html = html.substring(n)
  }

  function parseStartTag () { // 是否是开始标签
    const start = html.match(startTagOpen)
    if (start) { // 分组捕获，start[1]是标签名
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
      // <ul :class="bindCls" class="list" v-if="isShow"><li v-for="(item,index) in data" @click="clickItem(index)">{{item}}:{{index}}</li></ul>
        //直到匹配到 > 或者 />
        advance(attr[0].length)
        match.attrs.push(attr) // attr push到match.attrs里
      }
      if (end) { // 如果有close标签
        match.unarySlash = end[1] // 有/，就设置match.unarySlash，是自闭和标签
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) { // web是true
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) { // 如果p标签有NonPhrasingTag。就是不能在p里的元素，就会手动结束p标签。
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) { // p嵌套也闭合p
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash // 是否是自闭和标签
    // export const isUnaryTag = makeMap(
    //     'area,base,br,col,embed,frame,hr,img,input,isindex,keygen,' +
    //     'link,meta,param,source,track,wbr'
    // )

    const l = match.attrs.length
    const attrs = new Array(l) // 新建一个attrs长度的数组，然后遍历
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // args[1] v-if
      // args[3] isShow
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        if (args[3] === '') { delete args[3] } // 属性的值有很多种写法，如果满足一种，其余的都会匹配不上，结果则为undefined，但是火狐会为空字符串,所以要delete
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      const value = args[3] || args[4] || args[5] || '' // 最后的结果为args的3或4或5
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines // 需要转转译的东西需要解码
      attrs[i] = {
        name: args[1], // 捕捉的name
        value: decodeAttr(value, shouldDecodeNewlines) // value
      }
    } // 重新构造attrs

    if (!unary) { // 如果不是一元的，就会推入stack中，其中有标签名和属性
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      lastTag = tagName // 然后当前标签名赋值给lastTag
    }

    if (options.start) { // 如果有start函数，就调用，并把信息都传进去
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // Find the closest opened tag of the same type
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) { // 结束标签是否与stack中的栈顶元素相等
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) { // 开发环境中，i大于pos会警告，说明有子标签没闭合
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos // 栈的长度就是pos的位置
      lastTag = pos && stack[pos - 1].tag // lastTag就是pos-1的tag
    } else if (lowerCasedTagName === 'br') { // 如果pos小于0会执行这下面的逻辑
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') { // 遇到</p>，但是没有<p>，自动补上<p>,与handleStartTag相呼应。handleStartTag遇到不该在p里的元素时，会自动把p闭合 br同理
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
