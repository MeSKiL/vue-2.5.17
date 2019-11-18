##组件v-model
组件v-model和普通v-model parse阶段是一样的。但是在codegen阶段就有了区别。
codegen的时候执行了genData，genData中的genDirectives执行了web平台的modal方法。
组件的v-model处于这种情况
```javascript 1.6
else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  }
```

也就是会执行genComponentModel。这个方法主要做的一件事就是给el绑定了el.modal。
```javascript 1.6
export function genComponentModel ( // 组件的v-model会走到这里
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  const { number, trim } = modifiers || {}

  const baseValueExpression = '$$v'
  let valueExpression = baseValueExpression
  if (trim) {
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`
  }
  if (number) {
    valueExpression = `_n(${valueExpression})`
  }
  const assignment = genAssignmentCode(value, valueExpression)

  el.model = { // 给ast节点创建了个model属性
    value: `(${value})`,
    expression: `"${value}"`,
    callback: `function (${baseValueExpression}) {${assignment}}`
  }
}
```

genData在执行了genDirectives后又继续往后执行，这个时候el上是有modal方法的。就会给data加上
```javascript 1.6
  if (el.model) { // 组件的v-model情况,就会给data扩展一个。
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }
```

然后就要看执行阶段了。在createComponent的时候，检测到data.model存在就会执行transformModal。
transformModel干了啥呢，很简单。
```javascript 1.6
  if (isDef(data.model)) { // v-model
    // 把v-modal是数据转换成props和event
    transformModel(Ctor.options, data)
  }
```
如果子组件上没有定义model的，就给父占位符节点加上value这个props和input这个event。(父占位符节点和子组件指向同样的dom)
如果子组件有model，比如
```javascript 1.6
model:{
    prop:'msg',
    event:'change'
}
```
就会在父占位符节点上绑上msg这个props 和 change这个事件。子组件this.$emit('change',e.target.value)就行了。
```javascript 1.6
function transformModel (options, data: any) { // 添加key为value的prop，和input的event，有input就concat
  const prop = (options.model && options.model.prop) || 'value' // 如果子组件有定义model并且有prop就直接用定义的prop
  const event = (options.model && options.model.event) || 'input' // event同理
  ;(data.props || (data.props = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    on[event] = data.model.callback
  }
}
```
