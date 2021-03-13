const { tuple2 } = require(".")

/**
 * Class that can randomly select an item from a weighted selection.
 * 
 * @template T
 */
class Roulette {
  constructor() {
    /** @type {Array<{ weight: number, data: T } | undefined>} */
    this.entries = [];
    this.totalWeight = 0;
    this.count = 0;
  }
  
  spin() {
    if (this.count === 0) return -1;
    
    const limit = this.entries.length;
    const ball = Math.random() * this.totalWeight;
    let curWeight = 0;
    
    for (let i = 0; i < limit; i++) {
      const curEntry = this.entries[i];
      if (!curEntry) continue;
      curWeight += curEntry.weight;
      if (ball <= curWeight) return i;
    }
    
    return limit - 1;
  }
  
  /**
   * Adds a value to the pool.
   * 
   * @param {number} weight
   * @param {T} data
   */
  push(weight, data) {
    this.entries.push({ weight, data });
    this.totalWeight += weight;
    this.count += 1;
  }
  
  /**
   * Selects a value from the pool.
   * 
   * @returns {[T, number] | undefined}
   */
  pick() {
    const thePick = this.spin();
    if (thePick === -1) return undefined;
    const theWinner = this.entries[thePick];
    // @ts-ignore - `spin` is guarded.
    return tuple2(theWinner.data, theWinner.weight);
  }
  
  /**
   * Selects and removes a value from the pool.
   * 
   * @returns {[T, number] | undefined}
   */
  pickAndPop() {
    const thePick = this.spin();
    if (thePick === -1) return undefined;
    // @ts-ignore - `spin` is guarded.
    const { weight, data } = this.entries[thePick];
    this.entries[thePick] = undefined;
    this.totalWeight -= weight;
    this.count -= 1;
    return tuple2(data, weight);
  }
}

module.exports.Roulette = Roulette;