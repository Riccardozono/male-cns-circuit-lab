#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum V3Profile {
    #[default]
    Standard,
    Wide,
    Baseline,
    Current,
}

impl V3Profile {
    pub fn extract(args: &mut Vec<String>) -> Self {
        let mut profile = Self::Standard;
        // The published app gives Wide priority over Baseline and Current.
        for (flag, training) in [
            ("--male-cns-training-copy-v3-current", Self::Current),
            ("--male-cns-training-copy-v3-baseline", Self::Baseline),
            ("--male-cns-training-copy-v3", Self::Wide),
        ] {
            if args.iter().any(|arg| arg == flag) {
                profile = training;
                args.retain(|arg| arg != flag);
            }
        }
        profile
    }

    #[cfg(feature = "desktop")]
    pub fn is_training(self) -> bool {
        self != Self::Standard
    }

    pub fn graph_builder(self) -> &'static str {
        match self {
            Self::Standard => "tagV3",
            Self::Wide => "tagV3WideReadout",
            Self::Baseline => "tagV3TrainingBaseline",
            Self::Current => "tagV3TrainingCurrent",
        }
    }

    #[cfg(feature = "desktop")]
    pub fn label(self) -> &'static str {
        match self {
            Self::Standard => "MaleCNS V3 storico",
            Self::Wide => "MaleCNS V3 · Wide Readout (128)",
            Self::Baseline => "MaleCNS V3 · Baseline",
            Self::Current => "MaleCNS V3 · Current",
        }
    }
}
