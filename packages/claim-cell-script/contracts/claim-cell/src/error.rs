use ckb_std::error::SysError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Syscall(SysError),
    InvalidArguments,
    InvalidClaim,
    MissingIssuer,
    AmbiguousIssuer,
    UnauthorizedIssuer,
    DuplicateClaim,
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
            Self::InvalidClaim => 2,
            Self::MissingIssuer => 3,
            Self::AmbiguousIssuer => 4,
            Self::UnauthorizedIssuer => 5,
            Self::DuplicateClaim => 6,
        }
    }
}
