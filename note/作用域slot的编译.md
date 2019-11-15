##作用域slot的编译
```javascript 1.6
let Child = {
  template: '<div class="child">' +
  '<slot text="Hello " :msg="msg"></slot>' +
  '</div>',
  data() {
    return {
      msg: 'Vue'
    }
  }
}

let vm = new Vue({
  el: '#app',
  template: '<div>' +
  '<child>' +
  '<template slot-scope="props">' +
  '<p>Hello from parent</p>' +
  '<p>{{ props.text + props.msg}}</p>' +
  '</template>' +
  '</child>' +
  '</div>',
  components: {
    Child
  }
})
```
父组件也是同样的在parser阶段走到了processSlot

走到了这部分的代码

其实也就是干了一件事，给el绑上了slotScope。

对于子组件和默认组件是一样的。绑定个el.slotName值。
```javascript 1.6
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
  } else { // 给slot节点加上slotScope属性
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
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) { // 不是template也能拿到slotScope
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
```
执行完processSlot后会,start执行到else if的逻辑。给scopedSlots[name]赋值为这个节点。也就不走children.push了。
所以scopedSlots节点不会成为父节点的子节点。
```javascript 1.6
      if (currentParent && !element.forbidden) { // 如果有currentParent
        if (element.elseif || element.else) {
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot
          currentParent.plain = false // 如果是slotScope，就拿到name，并且不添加到父节点的子节点中
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element // 而是作为父节点的scopedSlots的name属性
        } else {
          currentParent.children.push(element) // 父的children要push子的
          element.parent = currentParent // 子的parent指向父的
        }
      }
```
然后来到codegen阶段。
对于父占位符节点来说，有slotScope属性，也就会走到genData的这个逻辑
这里的props就slot-scope传入的props，作为function的参数，之后会由执行fn的时候传入。props更加语义化，其实叫啥都一样。
就是用来获取子组件slot上的props的
```javascript 1.6
 if (el.scopedSlots) { // 有scopedSlots就会执行genScopedSlots
    data += `${genScopedSlots(el.scopedSlots, state)},`
    //    '<template slot-scope="props"><p>Hello from parent</p><p>{{ props.text + props.msg}}</p></template>'
    // {scopedSlots:_u([{key:"default",fn:function(props){return [_c('p',[_v("Hello from parent")]),_c('p',[_v(_s(props.text + props.msg))])]}}])
  }
```
data就是genScopedSlots后得到的值。也就是对属性进行处理，生成字符串。
也就是一个对象，scopedSlots属性对应一个_u方法，参数是一个有key和fn的数组。

再说子组件的codegen。会走到genSlot。

也就是会加上attrs和bind
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

这里的操作其实是将父占位符节点中的scopedSlot的节点封装进一个方法里。并不放到父占位符的children里去。
在子组件render的时候，执行这个方法，拿到之前封装的节点，成为自己的子节点。其实是一个延时创建字节的过程。
也就相当于虽然scopedSlot的节点写在父组件里，其实在子组件创建的时候才被创建的，也就可以拿到子组件的data了。
