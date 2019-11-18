##parse(1)
parse实际调用的是parseHTML。parseHTML的主要工作是两个环节。
第一个环节是对template做解析，第二个环节是在解析过程中调用回调函数，做ast元素的生成

```javascript 1.6
  const stack = [] // 存放开始标签的栈
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0 // 当前索引
  let last, lastTag // last是保留上次的html文本，lastTag是保留上次解析的标签
```
循环处理html，如果lastTag存在并且lastTag是style和script这种标签时，会走到else去。template是不允许写script和style的。
所以暂时理解是走不到else的，因此主要看if的内容。

如果尖括号的位置是0就匹配节点，如果尖括号的位置大于0就切割尖括号及以后，看是不是结束标签，如果不是，就找下一个尖括号及其以后。
啥意思呢？当匹配到这里的时候{{item}}:{{index}}</li></ul>
这个时候找到了</li>，是结束标签，就跳到</li></ul>，把前面的text创建文本ast。然后继续while(html)。
但是如果文本里也有< 那自然不是结束标签，就继续往后找< 找到</li> 就对了，继续下去。
如果text存在就要调用options.chars。
```javascript 1.6
  while (html) { // 循环html，直到对html处理完毕
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 如果lastTag不存在，或者不在style script，textarea中
      let textEnd = html.indexOf('<')
      if (textEnd === 0) { // 如果尖括号的位置是0
          
        // Comment:
        是否匹配到了注释节点

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        是否匹配到了条件注释节点

        // Doctype:
        doctype节点

        // End tag:
        是否匹配到了结束标签节点

        // Start tag:
        是否匹配到了开始标签节点
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
      ...
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }
```

下面我们详细来看看，匹配到第一个字符是<的时候各种情况处理

注释节点，如果匹配到了注释节点，与注释结尾。如果options中shouldKeepComment为true，就options.comment注释节点。然后跳过注释节点
```javascript 1.6
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
```

条件注释节点,遇到就跳过
```javascript 1.6
        if (conditionalComment.test(html)) {
          // <![if !IE]>
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) { // 如果有的话直接前进到结尾，并且什么都不做
            advance(conditionalEnd + 2)
            continue
          }
        }
```
doctype,遇到就跳过
```javascript 1.6
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) { // 是不是doctype节点,如果是就直接前进到他的长度
          advance(doctypeMatch[0].length)
          continue
        }
```

开始标签是通过parseStartTag()找到并返回的，找到的话会返回一个match，然后执行handleStartTag
```javascript 1.6
        const startTagMatch = parseStartTag()
        if (startTagMatch) { // 是不是匹配到开始标签节点，匹配到就会返回match对象
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
```

parseStartTag如果找到了开始标签，就创建match对象，然后往后添加属性，直到找到结尾，如果结尾是/> 设置match的unarySlash为/。然后返回match对象
```javascript 1.6
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
      if (end) { // 如果开始标签有结尾
        match.unarySlash = end[1] // 有/，就设置match.unarySlash，是自闭和标签
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }
```

然后就是handleStartTag,unary为是否为自闭合标签，然后遍历一遍match.attrs，兼容下火狐浏览器，将属性以name，value的对象放入attrs中
如果不是自闭合标签，就推入栈中。为了结束标签的时候，去寻找栈顶标签，如果找不到就警告html书写错误。
最后执行options.start
```javascript 1.6
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
```

结束标签节点,遇到就跳过，然后执行parseEndTag，代码就不贴了，其实主要与结束标签匹配的开始标签是不是在栈顶，在就对了，不在就警告
然后把相匹配的元素及该元素之上的元素全部出栈。
parseEndTag还有个作用就是遇到p结尾但是没有p开头的，补上<p>
与handleStartTag相呼应。handleStartTag遇到不该在p里的元素时，会自动把p闭合。br一个道理
```javascript 1.6
        const endTagMatch = html.match(endTag)
        if (endTagMatch) { // 是不是匹配到结束标签节点
          const curIndex = index
          advance(endTagMatch[0].length) // 匹配到就前进这个长度
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }
```

```javascript 1.6
<ul :class="bindCls" class="list" v-if="isShow"><li v-for="(item,index) in data" @click="clickItem(index)">{{item}}:{{index}}</li></ul>
```

如果是这个例子的话，会先匹配ul，走start，然后做属性处理。
之后匹配li，还是start，做属性处理。
之后是{{item}}:{{index}}</li></ul>会走到textEnd >= 0，这时候会跳到</li></ul>
并对{{item}}:{{index}}做字符串处理。
然后就是两个end。
