##slot总结
slot分为两种，一种是默认slot，一种是作用域slot。这两种的目的是一样的。就是将父组件中的节点放入子组件中。

默认slot是在编译阶段，给父组件的带有slot的节点给上slot属性。有name就是name，没有就是default。
父组件在走initRender的时候，会把有slot属性的节点插入相应的slot[name]中，没有的就插入default中。
子组件在renderSlot的时候，会去获取slot[name]的节点，然后渲染为自己的节点。

作用域slot是在编译阶段，给父组件上带有slot-scope的节点加上slot-scope属性。并且该节点不会成为父组件的children，
而是以插销name为key的对象，放到scopedSlots属性上。然后genData的时候，会把他们编译成生成节点的函数，并有相应的[name]。
然后就是父组件在render的时候会走到_u，也就是给this.$scopedSlots上挂上了相应的生成节点的function。
在子组件renderSlot的时候，执行了这些方法，挂载到了自己的节点上。

所以两种slot的本质区别是节点的创建时间。
默认slot的节点是随着父组件创建而创建。
作用域slot的节点是在父组件创建的时候生成创建一个一个节点的方法。在子组件创建的时候创建。

所以默认slot的作用域在父组件上，作用域slot的作用域在子组件上。
