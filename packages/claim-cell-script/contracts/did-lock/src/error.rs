use ckb_std::error::SysError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Syscall(SysError),
    InvalidArguments,
    MissingIdentity,
    AmbiguousIdentity,
    RecursiveController,
    UnauthorizedController,
}

impl From<SysError> for Error {
    fn from(error: SysError) -> Self {
        Self::Syscall(error)
    }
}

impl Error {
    pub fn code(self) -> i8 {
        match self {
            Self::Syscall(_) => -1,
            Self::InvalidArguments => 1,
            Self::MissingIdentity => 2,
            Self::AmbiguousIdentity => 3,
            Self::RecursiveController => 4,
            Self::UnauthorizedController => 5,
        }
    }
}
