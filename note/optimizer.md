##optimizer
optimizer主要是为了优化重新渲染过程中对静态节点的处理逻辑。patch中对静态节点是跳过的。

他主要做了两件事，第一是给深度遍历ast树ast元素递归打上static，第二是深度遍历ast树给ast的type为1的元素递归打上staticRoot

来看看具体是怎么实现的

```javascript 1.6
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  markStatic(root) // 给静态节点标记static 他和他的子节点全为static时，他才为static
  // second pass: mark static roots.
  markStaticRoots(root, false) // 设置staticRoot，子节点不为唯一的type3节点
}
```

对root做markStatic,首先给node的static赋值了isStatic(node)

isStatic的作用是 type2，也就是表达式肯定不是静态的就返回false type3肯定是静态的就返回true。

type是1的话，如果是pre就是静态的。或者说，如果没有bind并且没有for和if，不是slot和component，是保留标签，不是v-for的子节点，并且key都是静态的，就是static的节点
如果node的type是1，并且不是组件，就对子节点和ifConditions的block递归调用markStatic。如果子节点或者
```javascript 1.6
function markStatic (node: ASTNode) {
  node.static = isStatic(node)
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if ( // 如果是组件有子节点是不能标记为静态的
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    for (let i = 0, l = node.children.length; i < l; i++) { // 对子节点递归执行markStatic，如果递归中有一个子节点不是static，那他整个就不是static
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }
    if (node.ifConditions) { // 如果有if，就会递归调用block，只要有一个block不是static，整个都不是static
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}
```

```javascript 1.6
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression 表达式ast，不是静态的
    return false
  }
  if (node.type === 3) { // text 纯文本或者注释ast，静态的
    return true
  }
  return !!(node.pre || ( // type为1的时候
      // 是pre就是静态的
      // 没有bind的数据，没有if和for，不是slot component 是平台保留标签 不是v-for的子节点 node的key都满足是staticKey 才是静态节点
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}
```

markStaticRoots，其实更简单，如果node的type是1，并且是static的，并且子节点不是唯一的注释节点，就设置staticRoot为true。
因为如果该节点是static的，那么他的子节点也一定是static的。因为markStatic中，子节点不为static，父节点就不为static。
```javascript 1.6
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    } // 如果节点是static就给他设置当前节点是不是在v-for中，最外层是false
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !( // 如果node有children,并且不是唯一的type3节点，并且自己为static，那么他就是staticRoot
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else { // 如果children的长度是1并且是纯文本，就不是staticRoot
      node.staticRoot = false
    }
    if (node.children) { // 有children就会递归给子节点markStaticRoots
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}
```
