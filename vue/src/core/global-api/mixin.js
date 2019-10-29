/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) { // initGlobalAPI中调用
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin) // mergeOptions合并this.options与mixin
    return this
  }
}
// Vue.mixin({
//  created(){
//    console.log('111')
//  }
// }) 就会合并配置
