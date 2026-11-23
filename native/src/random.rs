use rquickjs::{Ctx, Function, Result};
use std::{cell::Cell, rc::Rc};

const MODULUS: f64 = 4_294_967_296.;
const INCREMENT: f64 = 0x6d2b_79f5_u32 as f64;

pub(crate) struct Random {
    // The reference saves the whole IEEE-754 counter. Wrapping the counter at
    // 32 bits would change later draws once that accumulated value rounds.
    state: f64,
}

impl Random {
    pub fn new(state: f64) -> Self {
        Self { state }
    }

    pub fn draw(&mut self) -> f64 {
        f64::from(self.next()) / MODULUS
    }

    fn next(&mut self) -> u32 {
        self.state += INCREMENT;
        let bits = self.state.trunc().rem_euclid(MODULUS) as u32;
        let t = (bits ^ (bits >> 15)).wrapping_mul(bits | 1);
        let t = t ^ t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
}

pub fn create(ctx: Ctx<'_>, seed: f64) -> Result<Function<'_>> {
    let state = Rc::new(Cell::new(seed));
    let cursor = state.clone();
    let draw = Function::new(ctx.clone(), move || {
        let mut random = Random::new(cursor.get());
        let value = random.draw();
        cursor.set(random.state);
        value
    })?;
    draw.set("getState", Function::new(ctx, move || state.get())?)?;
    Ok(draw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_draws_and_saved_counter() {
        let cases = [
            (
                0.,
                [1_144_304_738, 1_416_247, 958_946_056, 627_933_444],
                7_326_263_252.,
            ),
            (
                7717.,
                [1_691_508_796, 1_011_133_396, 1_217_372_947, 744_371_167],
                7_326_270_969.,
            ),
            (
                4_294_967_295.,
                [3_850_105_811, 813_802_916, 3_073_704_848, 4_054_706_436],
                11_621_230_547.,
            ),
            (
                9_007_199_254_740_992.,
                [3_850_105_811, 210_922_997, 429_257_462, 3_409_146_018],
                9_007_206_581_004_240.,
            ),
            (
                1e25,
                [0, 3_208_480_509, 0, 3_208_480_509],
                1.000000000000001e25,
            ),
        ];
        for (seed, values, end) in cases {
            let mut random = Random { state: seed };
            assert_eq!(std::array::from_fn::<_, 4, _>(|_| random.next()), values);
            assert_eq!(random.state, end);
        }
    }
}
