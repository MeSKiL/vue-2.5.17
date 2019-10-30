/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) { // initGlobalAPI中调用
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
        // 定义了Vue.component
        // Vue.directive
        // Vue.filter
      id: string, // my-component
      definition: Function | Object
    ): Function | Object | void {
      //Vue.component('my-component', {
      //
      // })
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) { // 如果type是component，并且定义是一个普通对象,如果definition不是对象，也就是工厂函数，就直接挂在options上
          definition.name = definition.name || id // 定义的name就是name不然就是id
          definition = this.options._base.extend(definition) // Vue.extend(definition),把definition转换为构造器
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition // 把构造器赋值给this.options.components[id]
        return definition
      }
    }
  })
}
