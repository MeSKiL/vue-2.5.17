```
data(){
	return {
		msg:{
			a:1
		}
	}
}
```
observe(this.data)
new Observer(data)
给this.data加上了__ob__

然后walk,就是给data的属性走defineReactive

也就是给msg加上getter和setter。如果谁调用了msg就会被依赖收集,添加到msg对应的dep里去，msg被触发就会派发更新

msg的dep执行 dep.depend()

同时msg是对象，会对msg走observe(msg)
new Observer(msg) 给msg加上了__ob__,并且给了a加上了getter和setter 返回值是```msg.__ob__```
谁调用了msg就会在
```msg.__ob__.dep.depend()```

总结：如果msg是对象，就会执行 dep.depend() 与 ```msg.__ob__.dep.depend()```

下面set调用了```msg.__ob__.dep.depend()```就触发了更新。
所以```msg.__ob__```其实就是专门为了Vue.Set用的。其实调用msg的dep.notify(),也同样可以触发更新，但是因为dep里只存了id，所以并找不到与msg相关联的dep。所以要用```msg.__ob__.dep```

数组方法其实就是就是重写了元素的数组方法，如果这个数组是响应式的，就强行notify。

总结一句话，不符合响应条件的，通过Vue.set Vue.del一样或者数组方法可以实现响应，内部其实是通过手动notify实现的
