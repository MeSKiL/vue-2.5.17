##event编译
event事件的编译其实在parse里其实就是processAttrs里的addHandler。下面来看看addHandler具体做了什么

addHandler首先存下modifiers。modifiers其实就是在processAttrs的modifiers = parseModifiers(name)的时候，取得对象。
他的作用是将click.native.prevent转换为click，并赋值modifiers为{native:true,prevent:true}
接下来判断如果modifiers里有capture，once，passive就相应的给name上加上符号。
如果是click事件，并且modifiers有right或者middle的，就把name转换为contextmenu或者mouseup。
event为nativeEvent的值或者为event的值。没有就为空对象。如果是nativeEvent，就把modifiers的native给删了。
这时候创建一个对象newHandler，value就是事件的value，如果有modifiers，就变为newHandler的属性。
最后如果event[name]不存在，就创建。如果存在了并且是一个对象，就变为一个数组放两项。如果本来就是数组就push或者unshift。
具体这个事件在event[name]这个数组里的位置，取决于他是不是important的。
```javascript 1.6
export function addHandler ( // 给el添加事件属性，nativeEvents或是events

  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: Function
) {
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.'
    )
  }

  // check capture modifier
  if (modifiers.capture) { // 如果有capture会拼接!
    delete modifiers.capture
    name = '!' + name // mark the event as captured
  }
  if (modifiers.once) { // 如果有once会拼接~
    delete modifiers.once
    name = '~' + name // mark the event as once
  }
  /* istanbul ignore if */
  if (modifiers.passive) { // 如果有passive会拼接&
    delete modifiers.passive
    name = '&' + name // mark the event as passive
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  if (name === 'click') { // 如果事件名是click
    if (modifiers.right) { // modifiers有right就改name为contextmenu
      name = 'contextmenu'
      delete modifiers.right
    } else if (modifiers.middle) { // modifiers有middle，就把name改为mouseup
      name = 'mouseup'
    }
  }

  let events
  if (modifiers.native) { // modifiers有native的时候，event就会指向nativeEvents
    // native就是给组件绑click的时候，没native是不执行的
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {}) // native的event在el.nativeEvents里
  } else {
    events = el.events || (el.events = {})
  } // 不存在就构造空对象

  const newHandler: any = {
    value: value.trim()
  } // 构造newHandler对象。如果有modifiers就添加为newHandler的属性
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  const handlers = events[name]
  /* istanbul ignore if */
  if (Array.isArray(handlers)) { // 如果handlers已经是数组了，就根据重要与否，加在最前面还是最后面
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) { // 有的话根据important与否,看加在数组的某个地方
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else { // events里没有这个事件就新建。
    events[name] = newHandler
  }

  el.plain = false
}
```
接下来就是把ast转化为具体代码的时候，看怎么处理事件了。
在genData里
```javascript 1.6
  if (el.events) {
    data += `${genHandlers(el.events, false, state.warn)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true, state.warn)},`
  }
```

其实就是genHandlers，看事件是否是native的，给字符串加上nativeOn还是on
遍历events中的事件然后依次执行genHandler处理事件
```javascript 1.6
export function genHandlers (
  events: ASTElementHandlers,
  isNative: boolean,
  warn: Function
): string {
  let res = isNative ? 'nativeOn:{' : 'on:{' // nativeOn 还是 on
  for (const name in events) { // 遍历每个event的事件名，可能是对象，也可能是数组
    res += `"${name}":${genHandler(name, events[name])},`
  }
  return res.slice(0, -1) + '}'
}
```
genHandler中如果handler是数组，就递归调用genHandler，逗号连接返回字符串就行了

这里有两个正则，一个是看是不是a.b a['b'] a["b"] a[0] a[b]这种形式的，一种是看是不是箭头函数或者是function的。
下面，如果没有修饰符，并且符合正则规则的，就直接返回value了。
然后就根据具体的modifierCode中的key去返回相应的代码。modifierCode在下面。
最后返回function($event){${code}${handlerCode}}，code就是genModifierCode，比如是增加了防止冒泡防止浏览器默认事件之类的语句。
handlerCode就是return 事件名($event)。
比如
```javascript 1.6
function($event){
    return clickHandler($event)
}
function($event){
    return (()=>{xxxxx})()
}
```
```javascript 1.6
function genHandler (
  name: string,
  handler: ASTElementHandler | Array<ASTElementHandler>
): string {
  if (!handler) {
    return 'function(){}'
  }

  if (Array.isArray(handler)) { // 如果是数组就遍历数组，递归调用handler对象，逗号链接然后返回
    return `[${handler.map(handler => genHandler(name, handler)).join(',')}]`
  }

  const isMethodPath = simplePathRE.test(handler.value)
  const isFunctionExpression = fnExpRE.test(handler.value)

  if (!handler.modifiers) { // 如果没有修饰符，并且满足了正则，就返回handler.value
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, handler.value)
    }
    return `function($event){${handler.value}}` // inline statement 如果没有匹配到，比如handlerClick($event)，就会返回这种情况
  } else { // 根据不同的modifiers的key做不同的逻辑
    let code = ''
    let genModifierCode = ''
    const keys = []
    for (const key in handler.modifiers) {
      if (modifierCode[key]) { // 如果满足，就生成对应的代码,stop就会往事件处理函数里插入阻止事件冒泡
        genModifierCode += modifierCode[key]
        // left/right
        if (keyCodes[key]) {
          keys.push(key)
        }
      } else if (key === 'exact') {
        const modifiers: ASTModifiers = (handler.modifiers: any)
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(keyModifier => !modifiers[keyModifier])
            .map(keyModifier => `$event.${keyModifier}Key`)
            .join('||')
        )
      } else {
        keys.push(key)
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys)
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    if (genModifierCode) {
      code += genModifierCode
    }
    const handlerCode = isMethodPath
      ? `return ${handler.value}($event)`
      : isFunctionExpression 
        ? `return (${handler.value})($event)` //(()=>{xxx})()
        : handler.value
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, code + handlerCode)
    }
    return `function($event){${code}${handlerCode}}`
  }
}
```

```javascript 1.6
const modifierCode: { [key: string]: string } = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  ctrl: genGuard(`!$event.ctrlKey`),
  shift: genGuard(`!$event.shiftKey`),
  alt: genGuard(`!$event.altKey`),
  meta: genGuard(`!$event.metaKey`),
  left: genGuard(`'button' in $event && $event.button !== 0`),
  middle: genGuard(`'button' in $event && $event.button !== 1`),
  right: genGuard(`'button' in $event && $event.button !== 2`)
}
```
