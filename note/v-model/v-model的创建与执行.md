##v-model的创建与执行
v-model的创建与更新event类似，是在patch过程中，执行hooks[create]的时候执行到的。
具体执行的是updateDirectives方法。
```javascript 1.6
function updateDirectives (oldVnode: VNodeWithData, vnode: VNodeWithData) { // patch的时候,执行create钩子函数执行到了这里
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode)
  }
}
```

这个方法对于v-model总体来说，主要是干了一件事，那就是绑定了两个事件。作用是输入中文拼音时，不随着输入赋值v-model的value。
来看看_update干了啥。

首先定义两个变量。表示是创建过程还是销毁过程。
然后对oldDirs和newDirs进行normalizeDirectives。
这个方法是对oldDirs和newDirs进行扩展，其实就是加上了modifiers。和def。def在model的情况下，是inserted和componentUpdated。

继续往后看，遍历了newDirs，如果这个key在oldDir里面没有，就说明是新加的。就会走dir.def.bind方法。
然后如果def里有inserted就会放到dirsWithInsert里。v-model的情况下是有inserted的，就会往dirsWithInsert里push。
如果oldDir里有这个key，那就是更新，就会走dir.def.update方法。v-model有componentUpdated，就往dirsWithPostpatch去push dir。

如果dirsWithInsert的长度存在，也就是说，有新建的dir指令存在的情况，就创建一个callInsert方法。
这个方法依次执行dirsWithInsert中的inserted方法。如果是create阶段，就把callInsert和hooks[insert]，merge。
也就是当hooks的insert执行的时候，会执行callInsert。
如果不是create阶段，就直接执行callInsert。
componentUpdated是随着postPatch执行的。而且仅仅针对select，这次就不说了。主要说callInsert。
```javascript 1.6
function _update (oldVnode, vnode) {
  const isCreate = oldVnode === emptyNode // 根据oldVnode和vnode的情况看是create过程还是destroy过程
  const isDestroy = vnode === emptyNode
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context)
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context)
  // newDirs[v-model] = dir

  const dirsWithInsert = []
  const dirsWithPostpatch = []

  let key, oldDir, dir
  for (key in newDirs) { // 遍历newDirs，拿到指令
    oldDir = oldDirs[key]
    dir = newDirs[key]
    if (!oldDir) { // 如果没有old，就是走bind
      // new directive, bind
      callHook(dir, 'bind', vnode, oldVnode) // 执行dir.def中的bind
      if (dir.def && dir.def.inserted) { // 如果有inserted就把dir push到dirsWithInsert中
        dirsWithInsert.push(dir)
      }
    } else { // 如果oldDir存在的话。就执行update
      // existing directive, update
      dir.oldValue = oldDir.value
      callHook(dir, 'update', vnode, oldVnode)
      if (dir.def && dir.def.componentUpdated) { // 如果有componentUpdated，就把dir push到dirsWithPostpatch
        dirsWithPostpatch.push(dir)
      }
    }
  }

  if (dirsWithInsert.length) {
    const callInsert = () => { // dirsWithInsert中的依次执行inserted方法
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode) // v-model在运行时绑定了两个事件，onCompositionStart，onCompositionEnd
      }
    }
    if (isCreate) { // 如果是创建过程，就把callInsert merge 到insert钩子中，也就是执行insert的时候也会执行callInsert
      mergeVNodeHook(vnode, 'insert', callInsert) // 实际执行wrappedHook，执行callInsert
    } else { // 不是创建过程就直接执行
      callInsert()
    }
  }

  if (dirsWithPostpatch.length) { // 如果有dirsWithPostpatch，就merge到postpatch中
    mergeVNodeHook(vnode, 'postpatch', () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode)
      }
    })
  }

  if (!isCreate) {
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy)
      }
    }
  }
}
```
上面说了，callInsert会随着hooks[insert]的调用而调用。hooks[insert]是在patch中的invokeInsertHook调用的。

调用了callInsert会发生什么呢？也就是执行了def.inserted。也就是这个方法。
这个方法说白了就是绑了两个事件，onCompositionStart和onCompositionEnd。
就是在输入中文的时候，出现拼音下划线是，会触发onCompositionStart。这个时候会设置```e.target.composing = true```
下划线结束以后会执行```e.target.composing = false;trigger(e.target, 'input')```
也就是说，在出现下划线的时候，不执行code。因为e.target.composing是true就return了。
消失下划线的时候，手动派发input事件，触发input回调。
```javascript 1.6
  inserted (el, binding, vnode, oldVnode) { // patch时走insert的时候，会走到这里
    if (vnode.tag === 'select') {
      // #6903
      if (oldVnode.elm && !oldVnode.elm._vOptions) {
        mergeVNodeHook(vnode, 'postpatch', () => {
          directive.componentUpdated(el, binding, vnode)
        })
      } else {
        setSelected(el, binding, vnode.context)
      }
      el._vOptions = [].map.call(el.options, getValue)
    } else if (vnode.tag === 'textarea' || isTextInputType(el.type)) { // 是input type的时候
      // makeMap('text,number,password,search,email,tel,url')
      el._vModifiers = binding.modifiers
      if (!binding.modifiers.lazy) { // 如果不是lazy
        el.addEventListener('compositionstart', onCompositionStart)
        el.addEventListener('compositionend', onCompositionEnd)
        // Safari < 10.2 & UIWebView doesn't fire compositionend when
        // switching focus before confirming composition choice
        // this also fixes the issue where some browsers e.g. iOS Chrome
        // fires "change" instead of "input" on autocomplete.
        el.addEventListener('change', onCompositionEnd)
        /* istanbul ignore if */
        if (isIE9) {
          el.vmodel = true
        }
      }
    }
  }
```
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
###所以说，看似很长的代码很难理解，总结起来就一句话。在patch阶段，对v-model这种情况，绑定了两个事件。
###为的是在输入中文的情况下，可以输入完成之后在执行绑定数据。
