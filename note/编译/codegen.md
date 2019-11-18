##codegen
```javascript 1.6
<ul :class="bindCls" class="list" v-if="isShow">
    <li v-for="(item,index) in data" @click="clickItem(index)">{{item}}:{{index}}</li>
</ul>
```
转换后得到
```javascript 1.6
with(this){
  return (isShow) ?
    _c('ul', {
        staticClass: "list",
        class: bindCls
      },
      _l((data), function(item, index) {
        return _c('li', {
          on: {
            "click": function($event) {
              clickItem(index)
            }
          }
        },
        [_v(_s(item) + ":" + _s(index))])
      })
    ) : _e()
}
```
codegen其实就是对ast树执行了generate，首先是新建了个CodegenState实例。然后对ast树进行genElement
```javascript 1.6
export function generate ( // codegen
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  const state = new CodegenState(options)
  const code = ast ? genElement(ast, state) : '_c("div")' // 有ast调用genElement,否则就是创建空div的代码块
  return { // render是渲染vnode使用的
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns // staticRoot用的
  }
}
```
genElement根据el上的属性，进行不同的gen操作。如示例中ul上有v-if，就会走到genIf，具体看看genIf干了啥。
```javascript 1.6
export function genElement (el: ASTElement, state: CodegenState): string {
  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget) {
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state)
  } else {
    // component or element
    let code
    if (el.component) {
      code = genComponent(el.component, el, state)
    } else {
      const data = el.plain ? undefined : genData(el, state)

      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}
```
genIf先把ifProcessed设置为了true，然后调用genIfConditions
```javascript 1.6
export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  el.ifProcessed = true // avoid recursion 避免递归genIf
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}
```
genIfconditions首先看conditions里是不是有东西，如果没有就返回_e()。
condition为conditions的栈顶元素，exp就是isShow，返回一个三元运算字符串，?后面是genTernaryExp :后面是递归调用genIfConditions。
重新调用genIfConditions时，conditions里已经没有内容了，所以:后面是_e()。那么再来看看genTernaryExp是干什么的。
```javascript 1.6
function genIfConditions ( // todo ifConditions里有否会有多个值
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) { // 没有conditions直接返回_e()
    return altEmpty || '_e()'
  }

  const condition = conditions.shift()
  if (condition.exp) { // 如果有exp就返回三元运算符这个代码块
    return `(${condition.exp})?${
      genTernaryExp(condition.block) // 又会执行genElement，又会走到genIf。由于ifProcessed是true了，就不会进来了
    }:${
      genIfConditions(conditions, state, altGen, altEmpty) // genIfConditions没值就会返回_e()
    }`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}
```

genTernaryExp
```javascript 1.6
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
```
其实我们的示例就是继续执行genElement，会重新走到genIf那边，因为genIf设置了process为true，所以就不会进genIf了，这也就是process的意义，防止递归调用。
所以上面一堆属性的gen的作用主要是处理属性，生成字符串。因为不是component，会走到genData和genChildren。
genData代码太长不贴了。就是根据el上的各个属性，修改data字符串，还调用了class的genData和style的genData，给字符串上加上了class和staticClass
style和staticStyle。

genChildren,如果children是长度为1，并且是v-for的，就直接对这个children走genElement。会进入genFor，待会再说。
如果不是这种特殊情况，就返回一个字符串，遍历children，对children的每项做genNode。也就是type为1就genElement 3和comment就genComment。不然就genText
```javascript 1.6
export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // optimize single v-for
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) { // 是唯一的children并且有el.for,就走genElement
      return (altGenElement || genElement)(el, state)
    }
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    const gen = altGenNode || genNode
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}
```

genFor是干啥呢，组件v-for没有key就会警告。设置了forProcessed，防止递归。最后返回一个字符串。
```javascript 1.6
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn( // 调用v-for的组件，没有key会警告
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      true /* tip */
    )
  }

  el.forProcessed = true // avoid recursion
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
}
```
_c就是createElement。_l就是用于v-for递归的。_e()就是createEmptyElement。
```javascript 1.6
export function installRenderHelpers (target: any) {
  target._o = markOnce
  target._n = toNumber
  target._s = toString
  target._l = renderList
  target._t = renderSlot
  target._q = looseEqual
  target._i = looseIndexOf
  target._m = renderStatic
  target._f = resolveFilter
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode
  target._e = createEmptyVNode
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
}
```

在compileToFunctions会把生成的字符串生成为函数。
