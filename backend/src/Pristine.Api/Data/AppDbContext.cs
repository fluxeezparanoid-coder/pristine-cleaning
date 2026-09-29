using Microsoft.EntityFrameworkCore;
using Pristine.Api.Domain;

namespace Pristine.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<CleaningService> Services => Set<CleaningService>();
    public DbSet<Extra> Extras => Set<Extra>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingExtra> BookingExtras => Set<BookingExtra>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.FullName).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(32);
            e.Property(x => x.PasswordHash).HasMaxLength(100);
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(16);
        });

        b.Entity<CleaningService>(e =>
        {
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Tagline).HasMaxLength(160);
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Icon).HasMaxLength(40);
            e.Property(x => x.Includes).HasMaxLength(2000);
            e.Property(x => x.BasePrice).HasPrecision(10, 2);
            e.Property(x => x.PricePerExtraBedroom).HasPrecision(10, 2);
            e.Property(x => x.PricePerExtraBathroom).HasPrecision(10, 2);
        });

        b.Entity<Extra>(e =>
        {
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Icon).HasMaxLength(40);
            e.Property(x => x.Price).HasPrecision(10, 2);
        });

        b.Entity<Booking>(e =>
        {
            e.HasIndex(x => x.Reference).IsUnique();
            e.HasIndex(x => new { x.CleanerId, x.StartUtc });
            e.HasIndex(x => new { x.CustomerId, x.StartUtc });
            e.HasIndex(x => x.Status);
            e.Property(x => x.Reference).HasMaxLength(16);
            e.Property(x => x.Street).HasMaxLength(200);
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.PostalCode).HasMaxLength(16);
            e.Property(x => x.AccessNotes).HasMaxLength(500);
            e.Property(x => x.CancellationReason).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Frequency).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Subtotal).HasPrecision(10, 2);
            e.Property(x => x.Discount).HasPrecision(10, 2);
            e.Property(x => x.Total).HasPrecision(10, 2);
            e.Property(x => x.ConcurrencyStamp).IsConcurrencyToken();
            e.Ignore(x => x.IsActive);

            e.HasOne(x => x.Customer).WithMany(u => u.Bookings)
                .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Cleaner).WithMany(u => u.AssignedJobs)
                .HasForeignKey(x => x.CleanerId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Service).WithMany()
                .HasForeignKey(x => x.ServiceId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Extras).WithOne()
                .HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Review).WithOne(r => r.Booking)
                .HasForeignKey<Review>(r => r.BookingId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<BookingExtra>(e =>
        {
            e.HasKey(x => new { x.BookingId, x.ExtraId });
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Price).HasPrecision(10, 2);
            e.HasOne<Extra>().WithMany().HasForeignKey(x => x.ExtraId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Review>(e =>
        {
            e.HasIndex(x => x.BookingId).IsUnique();
            e.Property(x => x.Comment).HasMaxLength(1000);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_Review_Rating", "\"Rating\" BETWEEN 1 AND 5"));
        });

        b.Entity<RefreshToken>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.FamilyId);
            e.Property(x => x.TokenHash).HasMaxLength(64);
            e.Property(x => x.CreatedByIp).HasMaxLength(64);
            e.HasOne(x => x.User).WithMany(u => u.RefreshTokens)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<AuditLog>(e =>
        {
            e.HasIndex(x => x.CreatedAtUtc);
            e.Property(x => x.Action).HasMaxLength(64);
            e.Property(x => x.UserEmail).HasMaxLength(254);
            e.Property(x => x.EntityType).HasMaxLength(64);
            e.Property(x => x.EntityId).HasMaxLength(64);
            e.Property(x => x.Details).HasMaxLength(1000);
            e.Property(x => x.IpAddress).HasMaxLength(64);
        });
    }
}
