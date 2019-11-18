##默认slot的编译
slot的parse过程在start的processElement中。
processElement中执行了processSlot

processSlot处理两种节点，一种是```<slot name="header" />```，另一种是```<h1 slot="header">标题</h1>```

先看第二种的逻辑。也就是直接走到了给slotTarget赋值的操作。slotTarget也就赋值为了header。
如果slotTarget为""就赋值为default，然后给el加上slot属性。

再来看第一种逻辑。第一种的话就满足了el.tag === 'slot'，然后给el的slotName上绑上name，也就是el.slotName=name。
```javascript 1.6
function processSlot (el) {
  if (el.tag === 'slot') {
    // <slot name="header" />
    el.slotName = getBindingAttr(el, 'name') // 给slot节点加上slotName属性 header
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`
      )
    }
  } else {
    let slotScope
    if (el.tag === 'template') {
      slotScope = getAndRemoveAttr(el, 'scope')
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && slotScope) {
        warn(
          `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
          true
        )
      }
      el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
        warn(
          `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
          true
        )
      }
      el.slotScope = slotScope
    }
    const slotTarget = getBindingAttr(el, 'slot') // 获取slot绑定的值
    // <h1 slot='header'>{{title}}</h1> slotTarget = slot
    if (slotTarget) {
      el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget // 如果是空就赋值default
      // preserve slot as an attribute for native shadow DOM compat
      // only for non-scoped slots.
      if (el.tag !== 'template' && !el.slotScope) {
        addAttr(el, 'slot', slotTarget) // 在el上加上slot属性
      }
    }
  }
}
```
processSlot处理slot很简单，一个是增加slotTarget。一个是增加了slotName。那么来看看codegen的时候，分别怎么对这两种情况做处理的吧。

codegen在执行genElement的时候,如果el的tag为slot，也就是第一种情况，这时候el是有slotName的，会走genSlot方法。


这个方法主要就是获取slot的children，然后生成代码字符串。
这个children会在执行阶段当作默认值，如果没有相应的slot子节点的话，就会使用默认的children了。
再加上attrs和bind，都是字面意思就不说了。
```javascript 1.6
function genSlot (el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"'
  const children = genChildren(el, state) // 取插槽下的子节点,未来作为默认节点
  let res = `_t(${slotName}${children ? `,${children}` : ''}`
  const attrs = el.attrs && `{${el.attrs.map(a => `${camelize(a.name)}:${a.value}`).join(',')}}`
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    res += `,null`
  }
  if (attrs) {
    res += `,${attrs}`
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`
  }
  // 拼接属性和bind
  return res + ')'
}
```

那第二种情况的在哪边处理呢？是在genData里执行了下面这句话。
```javascript 1.6
if (el.slotTarget && !el.slotScope) { // 有slotTarget，就会给data拼接slot属性
    data += `slot:${el.slotTarget},`
  }
```

slot的编译过程非常简单，这就讲完了。主要是执行过程。
