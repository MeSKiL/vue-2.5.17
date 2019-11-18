##作用域slot的执行
slot的执行也分两部分来讲。第一部分是父占位符节点render的时候。会执行到编译后的字符串形成的方法。也就是
```javascript 1.6
with(this){
  return _c('div',
    [_c('child',
      {scopedSlots:_u([
        {
          key: "default",
          fn: function(props) {
            return [
              _c('p',[_v("Hello from parent")]),
              _c('p',[_v(_s(props.text + props.msg))])
            ]
          }
        }])
      }
    )],
  1)
}
```
这里就会执行_u，也就是resolveScopedSlots方法会将数组转为key对应fn的对象。
示例中，就会转换为
```javascript 1.6
scopedSlots:{
    default:fn
}
```
fn其实是一个接收props，然后创建节点的方法。
这个方法会在子组件render的时候被执行。也就是创建节点。这就说scopeSlot巧妙的地方，也正是scopeSlot可以拿到子组件的data的原因。
他虽然是写在父组件的模板里的。但是他在子组件render的时候才被创建。这是一个延时创建节点的说法。
那么接下来看看子组件是如何延时创建这些节点的。

子组件走render的时候。会执行_t,也就是执行了renderSlot。

```javascript 1.6
with(this){
  return _c('div',
    {staticClass:"child"},
    [_t("default",null,
      {text:"Hello ",msg:msg}
    )],
  2)}
```

renderSlot对于scopedSlot的处理是这样的。
从this.$scopedSlots上获取name，例子中就是获取到default。
this.$scopedSlots是通过执行render之前```vm.$scopedSlots = _parentVnode.data.scopedSlots || emptyObject```拿到的。
拿到default的fn后传入props，也就是示例中的text和msg。创建了两个节点，返回。
```
  const scopedSlotFn = this.$scopedSlots[name]  // 父占位符创建的时候新建的,通过_u
  // 实际上this.$scopedSlots是key对应fn的对象
  let nodes
  if (scopedSlotFn) { // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    } // 子组件通过函数调用的方式创建nodes，将父组件的children保留下来，延迟到子组件render的时候取生成。随意也就可以访问到props的内容
    // scoped下的children，会在子组件render的时候创建，所以环境是子组件的环境
    nodes = scopedSlotFn(props) || fallback // 执行以后就返回 一个对象 key对应fn
  
```
正因为两个节点是在子组件render的时候创建的，所以环境也是子组件的环境。这就是为啥可以拿到子组件的props。

##所以这里我想说，vue间的组件传值，从来都不是子组件给父组件传值。而是组件的具体vnode给组件的占位符节点传值。其实就是自己给自己传值。
普通slot和作用域slot的区别就是，
普通slot是在父组件创建的时候也创建了。放到$slot里，执行阶段拿出来方法指定的位置。
而作用域slot是在父组件创建的时候生成一个创建方法。在子组件创建的时候执行创建方法，才创建。
两种slot的目的都是节点内容由父组件决定，但是数据的作用域由vnode创建的时机而决定。
