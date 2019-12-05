/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep { // 建立数据与watcher之间的桥梁 dep的target是全局的watcher
  static target: ?Watcher; // 静态的 只有一个
  id: number;
  subs: Array<Watcher>;

  constructor () { // 每创建一个dep id都会自增
    this.id = uid++
    this.subs = [] // 订阅这个数据变化的watcher会保存在subs
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () { // 调用watcher的addDep方法
    // 给此刻的watcher的dep里增加这个dep
    // 给这个dep里增加此刻的watcher
    if (Dep.target) {
      Dep.target.addDep(this) // 调用当前的watcher的addDep，传入该数据的dep实例
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    // 遍历订阅者
    for (let i = 0, l = subs.length; i < l; i++) {
      // 调用订阅者的update方法
      subs[i].update()
    }
  }
}

// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
Dep.target = null
const targetStack = []


//防止嵌套组件，父watcher先入栈，子的后入栈,通过pop获取上一个watcher
export function pushTarget (_target: ?Watcher) { // 在targetStack栈中原先的target 然后会把当前target赋值给Dep.target
  if (Dep.target) targetStack.push(Dep.target) // 第一次进来Dep.target不存在，就为_target。第二次进来，存在了，就把存在的target也就是父组件的target压入targetStack中,现在的target赋值给Dep.target
  Dep.target = _target
  // 也就是第一次进来前，targetStack为空，push完后也为空
  // 第二次进来前targetStack为空，push完后为之前的target
}

export function popTarget () {
  Dep.target = targetStack.pop()
}
