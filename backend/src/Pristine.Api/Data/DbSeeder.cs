using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pristine.Api.Domain;
using Pristine.Api.Features.Pricing;
using Pristine.Api.Features.Scheduling;
using Pristine.Api.Security;

namespace Pristine.Api.Data;

public sealed class SeedOptions
{
    public const string Section = "Seed";

    /// <summary>Seed demo users and ~2 months of realistic booking history. Never enable in production.</summary>
    public bool DemoData { get; init; }

    public string DemoPassword { get; init; } = string.Empty;
}

/// <summary>Populates the catalogue and (optionally) a believable demo data set.</summary>
public sealed class DbSeeder(
    AppDbContext db,
    IPasswordHasher hasher,
    IOptions<SeedOptions> seed,
    IOptions<SchedulingOptions> scheduling,
    TimeProvider clock,
    ILogger<DbSeeder> logger)
{
    public const string AdminEmail = "admin@pristine.demo";
    public const string CustomerEmail = "customer@pristine.demo";
    public const string CleanerEmail = "cleaner@pristine.demo";

    private readonly Random _rng = new(2026);

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (!await db.Services.AnyAsync(ct))
        {
            db.Services.AddRange(Services());
            db.Extras.AddRange(Extras());
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded service catalogue");
        }

        if (seed.Value.DemoData && !await db.Users.AnyAsync(ct))
        {
            if (seed.Value.DemoPassword.Length < 10)
                throw new InvalidOperationException("Seed:DemoPassword must be configured to seed demo users.");

            await SeedDemoAsync(ct);
            logger.LogInformation("Seeded demo users and bookings");
        }
    }

    private async Task SeedDemoAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var hash = hasher.Hash(seed.Value.DemoPassword); // hashed once, reused: BCrypt is deliberately slow

        User NewUser(string email, string name, UserRole role, string? phone = null) => new()
        {
            Email = email, FullName = name, Role = role, Phone = phone, PasswordHash = hash,
            CreatedAtUtc = now.AddDays(-_rng.Next(70, 400))
        };

        var admin = NewUser(AdminEmail, "Olivia Bennett", UserRole.Admin, "+44 20 7946 0101");
        var cleaners = new[]
        {
            NewUser(CleanerEmail, "Maria Santos", UserRole.Cleaner, "+44 7700 900111"),
            NewUser("james.walker@pristine.demo", "James Walker", UserRole.Cleaner, "+44 7700 900222"),
            NewUser("aisha.khan@pristine.demo", "Aisha Khan", UserRole.Cleaner, "+44 7700 900333"),
            NewUser("tom.novak@pristine.demo", "Tom Novak", UserRole.Cleaner, "+44 7700 900444")
        };
        var demoCustomer = NewUser(CustomerEmail, "Emma Thompson", UserRole.Customer, "+44 7700 900555");
        var customers = new[]
            {
                "Liam Carter", "Sophie Turner", "Noah Patel", "Grace Mitchell", "Oliver Hughes", "Chloe Evans",
                "Ethan Brooks", "Isla Morgan", "Lucas Reed", "Amelia Price", "Henry Foster", "Mia Collins",
                "Jack Ward", "Zara Ahmed", "Daniel Kim", "Ruby Clarke"
            }
            .Select(n => NewUser($"{n.ToLower().Replace(' ', '.')}@example.com", n, UserRole.Customer))
            .Prepend(demoCustomer)
            .ToArray();

        db.Users.Add(admin);
        db.Users.AddRange(cleaners);
        db.Users.AddRange(customers);

        var services = await db.Services.ToListAsync(ct);
        var extras = await db.Extras.ToListAsync(ct);
        var bookings = GenerateBookings(now, services, extras, cleaners, customers);

        // Make sure the demo customer has a story to explore: past visits (one still awaiting a review)
        // and upcoming visits that can be rescheduled or cancelled.
        var past = bookings.Where(b => b.Status == BookingStatus.Completed).OrderByDescending(b => b.StartUtc)
            .DistinctBy(b => b.StartUtc.DayOfYear / 7).Take(4).ToList(); // roughly one visit per week
        var upcoming = bookings.Where(b => b.Status == BookingStatus.Confirmed && b.StartUtc > now.AddDays(3))
            .OrderBy(b => b.StartUtc).DistinctBy(b => b.StartUtc.Date).Take(2).ToList();
        foreach (var b in past.Concat(upcoming))
        {
            b.Customer = demoCustomer;
            if (b.Review is not null) b.Review.Customer = demoCustomer;
        }
        if (past.Count > 0) past[0].Review = null;

        db.Bookings.AddRange(bookings);
        await db.SaveChangesAsync(ct);
    }

    private List<Booking> GenerateBookings(DateTime now, List<CleaningService> services, List<Extra> extras,
        User[] cleaners, User[] customers)
    {
        var opt = scheduling.Value;
        var tz = TimeZoneInfo.FindSystemTimeZoneById(opt.TimeZone);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, tz));
        var weights = new Dictionary<string, int> { ["standard"] = 45, ["deep"] = 25, ["move-in-out"] = 12, ["office"] = 12, ["post-renovation"] = 6 };
        var list = new List<Booking>();
        var references = new HashSet<string>();

        for (var day = today.AddDays(-62); day <= today.AddDays(21); day = day.AddDays(1))
        {
            if (!opt.WorkingDays.Contains(day.DayOfWeek)) continue;
            var isFuture = day > today;
            // Business ramps up over time, and the future is only partially booked.
            var density = isFuture ? 0.35 - (day.DayNumber - today.DayNumber) * 0.012 : 0.55 + (day.DayNumber - today.DayNumber + 62) * 0.004;

            foreach (var cleaner in cleaners)
            {
                var cursor = day.ToDateTime(new TimeOnly(opt.OpeningHour, 0)).AddMinutes(_rng.Next(0, 3) * 30);
                while (_rng.NextDouble() < density)
                {
                    var service = PickWeighted(services, weights);
                    var bedrooms = service.Slug == "office" ? _rng.Next(1, 4) : _rng.Next(1, 5);
                    var bathrooms = Math.Max(1, Math.Min(bedrooms, _rng.Next(1, 4)));
                    var chosenExtras = extras.Where(_ => _rng.NextDouble() < 0.18).ToList();
                    var frequency = (CleaningFrequency)_rng.Next(0, 4);
                    var quote = PricingService.Calculate(service, chosenExtras, bedrooms, bathrooms, frequency);

                    var endLocal = cursor.AddMinutes(quote.DurationMinutes);
                    if (endLocal.TimeOfDay > TimeSpan.FromHours(opt.ClosingHour) || endLocal.Date != cursor.Date) break;

                    var startUtc = TimeZoneInfo.ConvertTimeToUtc(cursor, tz);
                    var endUtc = TimeZoneInfo.ConvertTimeToUtc(endLocal, tz);
                    if (isFuture && startUtc < now.AddHours(opt.MinLeadTimeHours)) break;

                    var status = endUtc < now
                        ? (_rng.NextDouble() < 0.08 ? BookingStatus.Cancelled : BookingStatus.Completed)
                        : startUtc < now ? BookingStatus.InProgress : BookingStatus.Confirmed;
                    var (street, city, postcode) = Addresses[_rng.Next(Addresses.Length)];
                    var customer = customers[_rng.Next(1, customers.Length)];

                    var booking = new Booking
                    {
                        Reference = NextReference(references),
                        Customer = customer,
                        Cleaner = cleaner,
                        ServiceId = service.Id,
                        StartUtc = startUtc,
                        EndUtc = endUtc,
                        Bedrooms = bedrooms,
                        Bathrooms = bathrooms,
                        Frequency = frequency,
                        Street = $"{_rng.Next(1, 180)} {street}",
                        City = city,
                        PostalCode = postcode,
                        Status = status,
                        Subtotal = quote.Subtotal,
                        Discount = quote.Discount,
                        Total = quote.Total,
                        CreatedAtUtc = startUtc.AddDays(-_rng.Next(2, 20)),
                        UpdatedAtUtc = startUtc,
                        CompletedAtUtc = status == BookingStatus.Completed ? endUtc : null,
                        CancelledAtUtc = status == BookingStatus.Cancelled ? startUtc.AddDays(-2) : null,
                        CancellationReason = status == BookingStatus.Cancelled ? "Plans changed" : null,
                        Extras = chosenExtras.Select(e => new BookingExtra { ExtraId = e.Id, Name = e.Name, Price = e.Price, Minutes = e.Minutes }).ToList()
                    };

                    if (status == BookingStatus.Completed && _rng.NextDouble() < 0.72)
                    {
                        var rating = _rng.NextDouble() switch { < 0.74 => 5, < 0.94 => 4, _ => 3 };
                        booking.Review = new Review
                        {
                            Customer = customer,
                            CleanerId = cleaner.Id,
                            Rating = rating,
                            Comment = rating >= 4 ? ReviewComments[_rng.Next(ReviewComments.Length)] : "Good job overall, a couple of spots were missed.",
                            CreatedAtUtc = endUtc.AddHours(_rng.Next(2, 48))
                        };
                    }

                    list.Add(booking);
                    cursor = endLocal.AddMinutes(opt.TravelBufferMinutes + _rng.Next(0, 3) * 30);
                }
            }
        }

        return list;
    }

    private string NextReference(HashSet<string> used)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        string code;
        do code = "PR-" + new string(Enumerable.Range(0, 6).Select(_ => alphabet[_rng.Next(alphabet.Length)]).ToArray());
        while (!used.Add(code));
        return code;
    }

    private CleaningService PickWeighted(List<CleaningService> services, Dictionary<string, int> weights)
    {
        var roll = _rng.Next(weights.Values.Sum());
        foreach (var s in services)
        {
            roll -= weights.GetValueOrDefault(s.Slug, 0);
            if (roll < 0) return s;
        }
        return services[0];
    }

    private static readonly (string Street, string City, string PostCode)[] Addresses =
    [
        ("Baker Street", "London", "NW1 6XE"), ("Camden High Street", "London", "NW1 7JE"),
        ("King's Road", "London", "SW3 4NB"), ("Upper Street", "London", "N1 0PN"),
        ("Portobello Road", "London", "W11 2DY"), ("Brick Lane", "London", "E1 6RF"),
        ("Clapham High Street", "London", "SW4 7UR"), ("Marylebone Lane", "London", "W1U 2PA"),
        ("Greenwich Church Street", "London", "SE10 9BJ"), ("Shoreditch High Street", "London", "E1 6JE")
    ];

    private static readonly string[] ReviewComments =
    [
        "Absolutely spotless! Maria paid attention to every little detail. Booking took less than a minute.",
        "Came home to a flat that smelled amazing. The kitchen looks brand new. Already booked the next one.",
        "Punctual, friendly and incredibly thorough. The oven add-on is worth every penny.",
        "Best cleaning service I've used in London. Loved the live price calculator, no surprises.",
        "We used the move-out clean and got our full deposit back. Thank you!",
        "Our office has never looked this good. The team was quick and didn't disturb anyone.",
        "Super easy to reschedule online when my plans changed. Great experience overall.",
        "The bathroom is sparkling. Worth it just for the grout alone!",
        "Reliable every single week. The recurring discount is a lovely bonus.",
        "Very professional and respectful of our home. Highly recommend Pristine."
    ];

    private static IEnumerable<CleaningService> Services() =>
    [
        new()
        {
            Slug = "standard", Name = "Standard Clean", Icon = "sparkles", SortOrder = 1,
            Tagline = "Keep your home fresh and tidy, week after week.",
            Description = "Our most-booked service. A thorough top-to-bottom clean of every room: dusting, vacuuming, mopping, kitchen surfaces and a sparkling bathroom.",
            BasePrice = 89, PricePerExtraBedroom = 18, PricePerExtraBathroom = 22,
            BaseMinutes = 120, MinutesPerExtraBedroom = 30, MinutesPerExtraBathroom = 30,
            Includes = "Dusting of all reachable surfaces|Vacuuming & mopping floors|Kitchen worktops & exterior of appliances|Bathroom sanitising|Emptying bins"
        },
        new()
        {
            Slug = "deep", Name = "Deep Clean", Icon = "spray-can", SortOrder = 2, IsPopular = true,
            Tagline = "The reset button for your home.",
            Description = "Everything in the Standard Clean plus the places that are easy to forget: skirting boards, door frames, limescale removal, behind furniture and inside the microwave.",
            BasePrice = 149, PricePerExtraBedroom = 28, PricePerExtraBathroom = 32,
            BaseMinutes = 210, MinutesPerExtraBedroom = 45, MinutesPerExtraBathroom = 45,
            Includes = "Everything in Standard Clean|Skirting boards & door frames|Limescale & grout treatment|Behind & under furniture|Inside microwave|Light switches & handles disinfected"
        },
        new()
        {
            Slug = "move-in-out", Name = "Move In / Move Out", Icon = "truck", SortOrder = 3,
            Tagline = "Get your deposit back, or start fresh in a new place.",
            Description = "An end-of-tenancy grade clean for empty properties, built around the checklists landlords and letting agents actually use.",
            BasePrice = 199, PricePerExtraBedroom = 35, PricePerExtraBathroom = 40,
            BaseMinutes = 270, MinutesPerExtraBedroom = 60, MinutesPerExtraBathroom = 50,
            Includes = "Inventory-ready checklist|Inside all cupboards & drawers|Oven & hob degrease|Windows & sills|Deposit-back guarantee"
        },
        new()
        {
            Slug = "office", Name = "Office Clean", Icon = "building-2", SortOrder = 4,
            Tagline = "A cleaner workspace for a sharper team.",
            Description = "Flexible cleaning for small offices and studios, scheduled around your working hours, so the team walks into a spotless space.",
            BasePrice = 129, PricePerExtraBedroom = 20, PricePerExtraBathroom = 25,
            BaseMinutes = 150, MinutesPerExtraBedroom = 30, MinutesPerExtraBathroom = 30,
            Includes = "Desks & shared surfaces sanitised|Kitchenette & breakout areas|Washrooms restocked|Floors vacuumed & mopped|Recycling sorted"
        },
        new()
        {
            Slug = "post-renovation", Name = "Post-Renovation", Icon = "hammer", SortOrder = 5,
            Tagline = "From building site to move-in ready.",
            Description = "Heavy-duty removal of fine dust, paint splashes and debris after building work, using HEPA-filter equipment.",
            BasePrice = 249, PricePerExtraBedroom = 40, PricePerExtraBathroom = 45,
            BaseMinutes = 300, MinutesPerExtraBedroom = 60, MinutesPerExtraBathroom = 60,
            Includes = "HEPA vacuuming of fine dust|Paint & plaster splash removal|Window frames & glass|Fixtures & fittings polished|Debris bagged"
        }
    ];

    private static IEnumerable<Extra> Extras() =>
    [
        new() { Slug = "inside-oven", Name = "Inside the oven", Icon = "flame", Price = 29, Minutes = 45 },
        new() { Slug = "inside-fridge", Name = "Inside the fridge", Icon = "refrigerator", Price = 22, Minutes = 30 },
        new() { Slug = "interior-windows", Name = "Interior windows", Icon = "app-window", Price = 25, Minutes = 30 },
        new() { Slug = "inside-cabinets", Name = "Inside cabinets", Icon = "archive", Price = 24, Minutes = 30 },
        new() { Slug = "laundry", Name = "Laundry & folding", Icon = "shirt", Price = 18, Minutes = 30 },
        new() { Slug = "pet-hair", Name = "Pet hair treatment", Icon = "paw-print", Price = 15, Minutes = 20 },
        new() { Slug = "balcony", Name = "Balcony / terrace", Icon = "sun", Price = 20, Minutes = 30 },
        new() { Slug = "ironing", Name = "Ironing (1 hour)", Icon = "layers", Price = 26, Minutes = 60 }
    ];
}
