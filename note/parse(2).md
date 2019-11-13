##parse(2)
```javascript 1.6
<ul :class="bindCls" class="list" v-if="isShow"><li v-for="(item,index) in data" @click="clickItem(index)">{{item}}:{{index}}</li></ul>
```
之前讲了parseHTML主要干了啥，但是还有一部分的逻辑没有说，那就是options.start options.end options.chars options.comment

start其实干了两件事，一是创建ast元素，第二件事是ast树的处理。还有一些错误使用的处理。
```javascript 1.6
    start (tag, attrs, unary) {
      // 标签，属性，是否是自闭合标签 handleStartTag中会执行
      // 创建ast树，以及ast树管理
      // ast元素的创建 是否合法，处理v-for v-if等指令，处理element
      // ast树的处理 是否是根节点 是否有parent节点 是否是自闭合节点
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag) // 第一次进入的时候是undefined

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

    ast元素的创建

      function checkRootConstraints (el) { // 根节点不能有slot和template，也不能有v-for
        if (process.env.NODE_ENV !== 'production') {
          if (el.tag === 'slot' || el.tag === 'template') {
            warnOnce(
              `Cannot use <${el.tag}> as component root element because it may ` +
              'contain multiple nodes.'
            )
          }
          if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
              'Cannot use v-for on stateful component root element because ' +
              'it renders multiple elements.'
            )
          }
        }
      }

      ast树的管理
    }
```
ast元素的创建，ast元素的创建首先先通过createASTElement创建了ast元素
```javascript 1.6
{
    type: 1,
    tag,
    attrsList: attrs, // 属性数组
    attrsMap: makeAttrsMap(attrs), // 将attrs转为{name:value}形式
    parent,
    children: []
  }
```
attrsList是属性数组，attrsMap是属性数组的{name:value}形式,然后执行v-model的preTransforms

之后判断是不是v-pre模式，如果是的话就设置inVPre为true，如果是inVPre模式，就processPre。我们这里显然不是。
就会执行 processFor processIf processOnce processElement
这些方法具体是干啥呢，看下面
```javascript 1.6
      let element: ASTElement = createASTElement(tag, attrs, currentParent) // 创建ast元素
      if (ns) {
        element.ns = ns
      }

      if (isForbiddenTag(element) && !isServerRendering()) { // 如果是不允许的标签，并且不是服务端渲染，就警告
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) { // web 只对v-model处理
        element = preTransforms[i](element, options) || element
      }

      if (!inVPre) { // v-pre会让后面直接输入{{msg}}，而不是msg的值
        processPre(element) // 如果元素有v-pre，element.pre = true
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives

        // 对element做扩展
        processFor(element)
        processIf(element)
        processOnce(element)
        // element-scope stuff
        processElement(element, options) // 处理Element，新版代码在closeElement中
      }
```

processFor首先是把v-for从attrsList删了吗，然后把v-for的value解析以后，赋值给res，parseFor具体干啥就不说了，他的结果就是
解析(item,index)或者说(key,value,index)。res.alias是第一个参数 res.iterator1是第二个参数 res.iterator2是第三个参数
然后把res扩展到el上，如果没有res就警告v-for无效
```javascript 1.6
export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) { // 把v-for从attrsList删除，而保留在attrsMap里
    const res = parseFor(exp) // exp就是v-for的value
    if (res) { // 把res的属性扩展到el上
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`
      )
    }
  }
}
```

processIf第一件事也就是把v-if从attrsList上去除。然后exp是v-if的value，给el的if属性上赋值，然后往el.ifConditions上push{exp,block}
如果有v-else就给el.else赋值true，如果有v-else-if，就给el.elseif赋值为v-else-if的值
```javascript 1.6
function processIf (el) { // v-if="isShow"
  const exp = getAndRemoveAttr(el, 'v-if') // 获取到v-if，并在attrsList上删了
  if (exp) { // exp 为v-if的表达式 isShow
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    } // 如果有v-else就把el.else设置为true
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) { // 如果有elseif就设置el.elseif
      el.elseif = elseif
    }
  }
}
```
processOnce很简单，不解释了
```javascript 1.6
function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}
```
processElement就是对element做处理。element.plain代表着如果element没有attr也没有key，就是plain的element。
processKey是，如果有:key就给element.key赋值。
processRef就是给element.ref赋值
...
之后是给执行transforms，web平台下也就是class transformNode和style transformNode 他们的作用就是赋上
el.staticClass el.staticStyle el.classBinding el.styleBinding
最后是processAttrs，增加事件之类的比如@click，会在el上加上事件。至此以后，ast元素基本就创建完成了。
```javascript 1.6
export function processElement (element: ASTElement, options: CompilerOptions) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  element.plain = !element.key && !element.attrsList.length

  processRef(element)
  processSlot(element)
  processComponent(element)
  for (let i = 0; i < transforms.length; i++) {
    // class transformNode 赋el.staticClass和el.classBinding
    // style transformNode 赋el.staticStyle和el.styleBinding
    element = transforms[i](element, options) || element
  } // 去除了element里的class和style
  processAttrs(element)
}
```


创建完ast元素后就来到了，ast树管理。分成三部分，根节点管理。父子节点管理。自闭合管理。

如果此时没有根节点，那么现在的ast元素就是根节点，符合规则就行。
下一次进来的话，如果有根节点，但是stack没有长度了，说明这个元素还是根节点，那么他必须有v-if之类的并且符合root规则。
否则就是有多个根节点了，就会警告。

如果此时有父节点，那么子的parent指向父，父的children push 子

如果不是自闭合标签，就往stack里push，如果是自闭合标签，就执行closeElement。之后说什么是closeElement。
到此start就结束了。ul的start完了以后，会走li的start。

```javascript 1.6
// tree management
      if (!root) { // ast树的根节点，没有根节点的话，当前element就是根节点
        root = element
        checkRootConstraints(root) // root是否符合规则
      } else if (!stack.length) { // 下次进来如果stack.length为空，就说明不止一个根节点,就是根节点上有v-if的情况
        // allow root elements with v-if, v-else-if and v-else
        if (root.if && (element.elseif || element.else)) {
          checkRootConstraints(element)
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
        } else if (process.env.NODE_ENV !== 'production') { // 如果有多个根节点但是不是v-if的情况，就警告
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }
      if (currentParent && !element.forbidden) { // 如果有currentParent
        if (element.elseif || element.else) {
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot
          currentParent.plain = false
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        } else {
          currentParent.children.push(element) // 父的children要push子的
          element.parent = currentParent // 子的parent指向父的
        }
      }
      if (!unary) { // 如果不是自闭合，就把当前节点给currentParent。因为之后的节点就是他的子节点了。
        currentParent = element
        stack.push(element) // 同时放到stack里，和parseHTML的作用相同。保证开始和闭合是对应的
      } else { // 如果是自闭合，就closeElement
        closeElement(element)
      }
```

end干了啥事呢，相比于start就没有那么复杂了，来看看。

其实就是ast管理，以及标签结束逻辑。
主要做的就是把stack的栈顶元素出栈，然后如果最后一个子节点是纯文本节点,注释节点之类的，就pop
然后把currentParent指向现在的新栈顶元素。也就是遇到</li>后，currentParent指向了<ul>

closeElement其实就是把pre环境给取消。相当于一个还原状态的作用。最后是执行postTransforms。web环境没有postTransforms，就不说了。
```javascript 1.6
    end () {
      // parseEndTag走end
      // ast管理，以及标签结束逻辑
      // remove trailing whitespace
      const element = stack[stack.length - 1] // 获取stack的最后一个元素，这里的stack与parseHTML中的作用不同，parseHTML中的stack即起到了约束作用，也起到了管理作用。这里的作用是管理ast树。
      const lastNode = element.children[element.children.length - 1] // 获取该元素的最后一个子节点
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) { // 如果最后一个子节点是纯文本就pop
        element.children.pop()
      }
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1] // 标签end了以后，pop出去后，currentParent指向新的栈顶元素
      closeElement(element) // 退出inVPre环境 与inPre环境
    }
```

chars也很简单，来看看代码

如果文本节点没有parent就会警告。然后对text做处理
inPre环境或者text不为空格的情况下，如果当前节点的父节点是script或者style的话直接返回text，否则decode。
如果不是inPre，并且text只有空格，就看preserveWhitespace和children的长度而返回' '还是''
处理后如果text还存在，并且不是' '也不是inVPre环境，就往children里push一个type为2的表达式ast。
如果是inVPre环境或者纯文本节点，就push type为3的表达式
```javascript 1.6
    chars (text: string) {
      // parseHTML中执行
      // 处理文本，以及创建文本ast节点
      if (!currentParent) { // 没有text节点currentParent
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) { // 整个组件都纯文本就报这个警告
            warnOnce(
              'Component template requires a root element, rather than just text.'
            )
          } else if ((text = text.trim())) { // text在根节点之外也会报错
            warnOnce(
              `text "${text}" outside root element will be ignored.`
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      text = inPre || text.trim() // inPre环境或者text不为空格的情况下，如果当前节点的父节点是script或者style的话直接返回text，否则decode。如果不是inPre，并且text只有空格，就看preserveWhitespace和children的长度而返回' '还是''
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // only preserve whitespace if its not right after a starting tag
        : preserveWhitespace && children.length ? ' ' : ''
      if (text) {
        let res
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) { // text存在并且不为 ' '，而且不在inVPre环境下时，
          children.push({
            type: 2, // 表达式ast
            expression: res.expression,
            tokens: res.tokens,
            text
          })
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') { // inVPre或者纯文本节点
          children.push({ // 纯文本节点
            type: 3,
            text
          })
        }
      }
    }
```

chars完事后就是最简单的comment了

```javascript 1.6
    comment (text: string) {
      // 创建注释节点ast
      currentParent.children.push({ // 注释节点
        type: 3,
        text,
        isComment: true
      })
    }
```
这里就直接push type为3的节点就行了，并且加个属性，isComment。
到这里为止，几个回调函数就讲完了。最后也就是会返回一个完整的ast树，有children也为ast元素的的ast树
