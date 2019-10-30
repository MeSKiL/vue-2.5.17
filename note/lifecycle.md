##Vue生命周期
* beforeMount执行是先父组件，后子组件。
* mounted是先执行子组件，后父组件。

* beforeDestroy 执行是先父组件，后子组件。
* destroyed是先执行子组件，后父组件。

其实很符合直觉，先挂父组件。发现子组件，挂子组件。所以beforeMount是先父后子
子组件挂载好了，才意味着父组件能挂载好。所以mounted是先子后父
destroy同理

具体原因参考源码中生命周期的执行顺序
