namespace Pristine.Api.Domain;

public enum UserRole
{
    Customer = 0,
    Cleaner = 1,
    Admin = 2
}

public enum BookingStatus
{
    Pending = 0,
    Confirmed = 1,
    InProgress = 2,
    Completed = 3,
    Cancelled = 4
}

public enum CleaningFrequency
{
    OneTime = 0,
    Monthly = 1,
    Biweekly = 2,
    Weekly = 3
}
