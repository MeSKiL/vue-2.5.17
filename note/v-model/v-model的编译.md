##v-model的编译
v-model是在作为属性在processAttrs中被处理的。
在processAttrs中，v-model会走到这个分支逻辑

name会改为model。arg不满足不看了，然后会执行addDirective。这个方法是将传入的参数加入el.directives数组中。
最后做一个验证，如果有v-for了的话，再有v-model就会警告。
```javascript 1.6
else { // normal directives
        // 有v- 不是v-if 不是v-for 不是v-on 不是 v-bind
        // v-text v-html v-model
        name = name.replace(dirRE, '') // v-model的name就是model
        // parse arg
        const argMatch = name.match(argRE)
        const arg = argMatch && argMatch[1]
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
        }
        addDirective(el, name, rawName, value, arg, modifiers) // 把参数放入el.directives数组中
        if (process.env.NODE_ENV !== 'production' && name === 'model') { // 非生产的v-model会走这个逻辑
          checkForAliasModel(el, value)
        }
      }
```
这里parse阶段就这些说的，其实很简单。后面看看codegen做了什么。

genData一开始就执行了  ```  const dirs = genDirectives(el, state)```，就是处理了genDirectives。
genDirectives会根据v-model执行model方法

genDirectives首先获取了directives，如果不存在就返回。很好理解。
如果directives存在，res就先初始为directives:[。
然后遍历dirs数组。如果dir数组中，有一个满足条件，就能返回结果。如果一个也不满足，就return undefined。
这里的gen 是web平台的model。needRuntime其实就是执行web平台的model后的结果。为true就修改res的值。
gen其实也是为el的实例去加了一个prop和一个event。接下来来看看gen干了啥。
```javascript 1.6
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives // 获取directives
  if (!dirs) return
  let res = 'directives:['
  let hasRuntime = false
  let i, l, dir, needRuntime
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i]
    needRuntime = true
    const gen: DirectiveFunction = state.directives[dir.name] // 通过指令名称获取function，也就是state.directives[model],web平台实际上是platforms/web/compiler/directives/model
    if (gen) { // 如果gen存在就执行gen
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn)
    }
    if (needRuntime) {
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:"${dir.arg}"` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) {
    return res.slice(0, -1) + ']'
  }
}
```

如果el是input并且是file类型，就警告。我们这里看v-model绑的是普通的input输入框的时候。就会走到genDefaultModel，并且返回true。
那genDefaultModel干了啥呢。
```javascript 1.6
export default function model ( // genDirectives中 v-model情况下的gen
  el: ASTElement,
  dir: ASTDirective,
  _warn: Function
): ?boolean {
  warn = _warn
  const value = dir.value // v-model="message" value === message
  const modifiers = dir.modifiers
  const tag = el.tag
  const type = el.attrsMap.type

  if (process.env.NODE_ENV !== 'production') {
    // inputs with type="file" are read only and setting the input's
    // value will throw an error.
    if (tag === 'input' && type === 'file') { // 如果是file类型的input就警告
      warn(
        `<${el.tag} v-model="${value}" type="file">:\n` +
        `File inputs are read only. Use a v-on:change listener instead.`
      )
    }
  }

  if (el.component) {
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  } else if (tag === 'select') {
    genSelect(el, value, modifiers)
  } else if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers)
  } else if (tag === 'input' && type === 'radio') {
    genRadioModel(el, value, modifiers)
  } else if (tag === 'input' || tag === 'textarea') {
    genDefaultModel(el, value, modifiers)
  } else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `<${el.tag} v-model="${value}">: ` +
      `v-model is not supported on this element type. ` +
      'If you are working with contenteditable, it\'s recommended to ' +
      'wrap a library dedicated for that purpose inside a custom component.'
    )
  }

  // ensure runtime directive metadata
  return true
}
```

首先是v-bind和v-model一起用会警告。
然后获取了lazy，number，trim。如果是lazy的话，触发事件就是change，不然是input。range先不管他。
```let valueExpression = '$event.target.value'```设置初始的valueExpression。然后有trim就trim，有number就number。
然后去生成code，通过genAssignmentCode方法。简单来说就是返回了value=message。
如果不是lazy也不是range，就加上```if($event.target.composing)return;${code}```
最后也就是最重要的，也是之前说的。gen的本质是给input绑prop和@event。也就是这里的addProp和addHandler。
最后如果是trim和number类型的话，要走一次forceUpdate。
```javascript 1.6
function genDefaultModel ( // 如果是input输入类型的或者textarea类型的
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  const type = el.attrsMap.type

  // warn if v-bind:value conflicts with v-model
  // except for inputs with v-bind:type
  if (process.env.NODE_ENV !== 'production') {
    const value = el.attrsMap['v-bind:value'] || el.attrsMap[':value'] // 如果v-model和v-bind一起用会警告冲突
    const typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type']
    if (value && !typeBinding) {
      const binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value'
      warn(
        `${binding}="${value}" conflicts with v-model on the same element ` +
        'because the latter already expands to a value binding internally'
      )
    }
  }

  const { lazy, number, trim } = modifiers || {}
  // 修饰符里的lazy 失去焦点才更新
  // number将字符串转为number类型
  // trim 过滤首尾空格
  const needCompositionGuard = !lazy && type !== 'range' // 滑块
  const event = lazy // 如果是lazy 事件就是change，如果不是lazy，但是type是range，事件就是range_token，不然就是input
    ? 'change'
    : type === 'range'
      ? RANGE_TOKEN
      : 'input'

  let valueExpression = '$event.target.value'
  if (trim) {
    valueExpression = `$event.target.value.trim()`
  }
  if (number) {
    valueExpression = `_n(${valueExpression})`
  }

  let code = genAssignmentCode(value, valueExpression)
  // value=valueExpression 或者 $set(exp,key,assignment)
  if (needCompositionGuard) { // 不是lazy也不是滑块
    code = `if($event.target.composing)return;${code}`
  }

  addProp(el, 'value', `(${value})`) // 给el加上value这个props
  addHandler(el, event, code, null, true) // 给el加上@input事件
  // :value='message'
  // @input='message=$event.target.value'
  if (trim || number) {
    addHandler(el, 'blur', '$forceUpdate()')
  }
}
```

###v-model的本质其实就是给el上绑了prop是value，然后绑了@input，去触发value的变化。
```javascript 1.6
let vm = new Vue({
  el: '#app',
  template: '<div>'
  + '<input v-model="message" placeholder="edit me">' +
  '<p>Message is: {{ message }}</p>' +
  '</div>',
  data() {
    return {
      message: ''
    }
  }
})
```
```javascript 1.6
with(this) {
  return _c('div',[_c('input',{
    directives:[{
      name:"model",
      rawName:"v-model",
      value:(message),
      expression:"message"
    }],
    attrs:{"placeholder":"edit me"},
    domProps:{"value":(message)},
    on:{"input":function($event){
      if($event.target.composing)
        return;
      message=$event.target.value
    }}}),_c('p',[_v("Message is: "+_s(message))])
    ])
}
```
